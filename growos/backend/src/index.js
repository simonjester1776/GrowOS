const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { createServer } = require('http');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const { connect: connectDB, pool } = require('./db/pool');
const { connect: connectRedis, health: redisHealth } = require('./services/redisClient');
const mqttClient = require('./services/mqttClient');
const cronJobs = require('./services/cronJobs');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const requestValidator = require('./middleware/requestValidator');

// Route imports
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const sensorRoutes = require('./routes/sensors');
const alertRoutes = require('./routes/alerts');
const relayRoutes = require('./routes/relays');
const dashboardRoutes = require('./routes/dashboard');
const firmwareRoutes = require('./routes/firmware');
const systemRoutes = require('./routes/system');

const app = express();
const httpServer = createServer(app);

// Trust proxy for accurate IP behind reverse proxy
app.set('trust proxy', 1);

// WebSocket server with authentication
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io accessible to routes
app.set('io', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.CLIENT_URL || '*'],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.CLIENT_URL ? [process.env.CLIENT_URL] : false)
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.use(compression());

// Rate limiting - stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes for auth
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 100 requests per minute in production
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip // Use IP for rate limiting
});

// Speed limiting - slow down after certain threshold
const speedLimiter = slowDown({
  windowMs: 1 * 60 * 1000, // 1 minute
  delayAfter: 50, // allow 50 requests per minute at full speed
  delayMs: 500, // add 500ms delay per request after threshold
  maxDelayMs: 5000, // max delay of 5 seconds
});

app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/', apiLimiter);
app.use('/api/', speedLimiter);

// Body parsing with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true // Only accept arrays and objects
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID and logging
app.use((req, res, next) => {
  req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-Id', req.id);
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  next();
});

// API Documentation
if (process.env.NODE_ENV !== 'production') {
  try {
    const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    logger.info('API documentation available at /api-docs');
  } catch (err) {
    logger.warn('Swagger documentation not found');
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    services: {}
  };

  // Check database
  try {
    await pool.query('SELECT 1');
    health.services.database = { status: 'ok' };
  } catch (err) {
    health.services.database = { status: 'error', message: err.message };
    health.status = 'degraded';
  }

  // Check Redis
  const redisStatus = await redisHealth();
  health.services.redis = redisStatus;
  if (redisStatus.status !== 'ok' && redisStatus.status !== 'disabled') {
    health.status = 'degraded';
  }

  // Check MQTT
  health.services.mqtt = { 
    status: mqttClient.isConnected() ? 'ok' : 'disconnected',
    connected: mqttClient.isConnected()
  };
  if (!mqttClient.isConnected()) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness probe - for Kubernetes
app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: 'Database not ready' });
  }
});

// Liveness probe - for Kubernetes
app.get('/live', (req, res) => {
  res.json({ alive: true, uptime: process.uptime() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/sensors', sensorRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/relays', relayRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/firmware', firmwareRoutes);
app.use('/api/v1/system', systemRoutes);

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Verify JWT
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.user = decoded;
    next();
  } catch (err) {
    logger.warn('WebSocket authentication failed:', err.message);
    next(new Error('Invalid token'));
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}, user: ${socket.userId}`);
  
  // Join user's room for broadcast messages
  socket.join(`user:${socket.userId}`);
  
  socket.on('subscribe_device', (deviceId) => {
    // Verify user owns this device before subscribing
    socket.join(`device:${deviceId}`);
    logger.info(`Socket ${socket.id} subscribed to device:${deviceId}`);
  });
  
  socket.on('unsubscribe_device', (deviceId) => {
    socket.leave(`device:${deviceId}`);
    logger.info(`Socket ${socket.id} unsubscribed from device:${deviceId}`);
  });

  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ time: Date.now() });
    }
  });
  
  socket.on('disconnect', (reason) => {
    logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info(`${signal} received, shutting down gracefully...`);
  
  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close WebSocket connections
  io.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close database connections
  try {
    await pool.end();
    logger.info('Database connections closed');
  } catch (err) {
    logger.error('Error closing database:', err);
  }

  // Close MQTT connection
  try {
    mqttClient.disconnect();
    logger.info('MQTT client disconnected');
  } catch (err) {
    logger.error('Error disconnecting MQTT:', err);
  }

  // Exit after cleanup
  setTimeout(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  }, 1000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected');
    
    // Connect to Redis (optional but recommended)
    try {
      await connectRedis();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn('Redis not available, continuing without caching');
    }
    
    // Connect to MQTT broker
    await mqttClient.connect(app);
    logger.info('MQTT client connected');
    
    // Start cron jobs
    cronJobs.start();
    logger.info('Cron jobs started');
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`GrowOS Backend v${process.env.npm_package_version || '1.0.0'} running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = { app, io };
