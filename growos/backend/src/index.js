const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const { connect: connectDB } = require('./db/pool');
const mqttClient = require('./services/mqttClient');
const cronJobs = require('./services/cronJobs');

// Route imports
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const sensorRoutes = require('./routes/sensors');
const alertRoutes = require('./routes/alerts');
const relayRoutes = require('./routes/relays');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Make io accessible to routes
app.set('io', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0'
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/sensors', sensorRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/relays', relayRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('subscribe_device', (deviceId) => {
    socket.join(`device:${deviceId}`);
    logger.info(`Socket ${socket.id} subscribed to device:${deviceId}`);
  });
  
  socket.on('unsubscribe_device', (deviceId) => {
    socket.leave(`device:${deviceId}`);
    logger.info(`Socket ${socket.id} unsubscribed from device:${deviceId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected');
    
    // Connect to MQTT broker
    await mqttClient.connect(app);
    logger.info('MQTT client connected');
    
    // Start cron jobs
    cronJobs.start();
    logger.info('Cron jobs started');
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`GrowOS Backend running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
