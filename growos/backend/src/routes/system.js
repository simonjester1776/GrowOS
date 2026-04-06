const express = require('express');
const os = require('os');
const { pool } = require('../db/pool');
const logger = require('../utils/logger');
const mqttClient = require('../services/mqttClient');
const redisClient = require('../services/redisClient');
const { authenticateToken } = require('./auth');
const { asyncHandler, AuthorizationError } = require('../middleware/errorHandler');

const router = express.Router();

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    throw new AuthorizationError('Admin access required');
  }
  next();
};

// Apply auth to all routes
router.use(authenticateToken);

// System statistics (admin only)
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  // Database stats
  const dbStats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM devices) as total_devices,
      (SELECT COUNT(*) FROM devices WHERE is_online = true) as online_devices,
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM sensor_readings WHERE ts > NOW() - INTERVAL '24 hours') as readings_24h,
      (SELECT COUNT(*) FROM alert_history WHERE created_at > NOW() - INTERVAL '24 hours') as alerts_24h
  `);
  
  // System resources
  const systemStats = {
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    cpu: os.loadavg(),
    platform: os.platform(),
    nodeVersion: process.version
  };
  
  // Connection stats
  const connectionStats = {
    mqtt: mqttClient.isConnected(),
    redis: redisClient.isConnected,
    database: true
  };
  
  res.json({
    success: true,
    stats: {
      database: dbStats.rows[0],
      system: systemStats,
      connections: connectionStats
    }
  });
}));

// Database maintenance (admin only)
router.post('/maintenance/vacuum', requireAdmin, asyncHandler(async (req, res) => {
  logger.info('Starting database vacuum...');
  
  // Vacuum sensor readings table
  await pool.query('VACUUM ANALYZE sensor_readings');
  
  logger.info('Database vacuum completed');
  
  res.json({
    success: true,
    message: 'Database vacuum completed'
  });
}));

// Clear old data (admin only)
router.post('/maintenance/cleanup', requireAdmin, asyncHandler(async (req, res) => {
  const { days = 90 } = req.body;
  
  logger.info(`Starting data cleanup for data older than ${days} days...`);
  
  // Delete old sensor readings
  const sensorResult = await pool.query(
    `DELETE FROM sensor_readings WHERE ts < NOW() - INTERVAL '${days} days' RETURNING COUNT(*)`
  );
  
  // Delete old alert history (resolved only)
  const alertResult = await pool.query(
    `DELETE FROM alert_history 
     WHERE created_at < NOW() - INTERVAL '${days} days' 
     AND resolved_at IS NOT NULL 
     RETURNING COUNT(*)`
  );
  
  // Delete old relay history
  const relayResult = await pool.query(
    `DELETE FROM relay_history WHERE created_at < NOW() - INTERVAL '${days} days' RETURNING COUNT(*)`
  );
  
  logger.info('Data cleanup completed');
  
  res.json({
    success: true,
    deleted: {
      sensorReadings: parseInt(sensorResult.rows[0].count) || 0,
      alerts: parseInt(alertResult.rows[0].count) || 0,
      relayHistory: parseInt(relayResult.rows[0].count) || 0
    }
  });
}));

// Get system logs (admin only)
router.get('/logs', requireAdmin, asyncHandler(async (req, res) => {
  const { level = 'info', limit = 100, since } = req.query;
  
  // This would typically read from a log aggregation service
  // For now, return a placeholder
  res.json({
    success: true,
    logs: [],
    message: 'Log retrieval not implemented - use external log aggregation'
  });
}));

// Broadcast message to all users (admin only)
router.post('/broadcast', requireAdmin, asyncHandler(async (req, res) => {
  const { message, type = 'info' } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const io = req.app.get('io');
  io.emit('system_broadcast', {
    type,
    message,
    timestamp: Date.now()
  });
  
  logger.info(`System broadcast sent: ${message}`);
  
  res.json({
    success: true,
    message: 'Broadcast sent'
  });
}));

// Get backup status (admin only)
router.get('/backup/status', requireAdmin, asyncHandler(async (req, res) => {
  // This would check backup service status
  res.json({
    success: true,
    backup: {
      lastBackup: null,
      nextScheduled: null,
      status: 'not_configured'
    }
  });
}));

// Trigger backup (admin only)
router.post('/backup/trigger', requireAdmin, asyncHandler(async (req, res) => {
  const { type = 'full' } = req.body;
  
  logger.info(`Backup triggered: ${type}`);
  
  // This would trigger actual backup process
  // For now, return placeholder
  res.json({
    success: true,
    message: 'Backup triggered',
    backupId: `backup-${Date.now()}`
  });
}));

// User activity (admin only)
router.get('/activity/users', requireAdmin, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  
  const result = await pool.query(
    `SELECT 
      u.id, u.email, u.first_name, u.last_name, u.last_login, u.created_at,
      (SELECT COUNT(*) FROM devices WHERE user_id = u.id) as device_count
    FROM users u
    ORDER BY u.last_login DESC NULLS LAST
    LIMIT $1`,
    [limit]
  );
  
  res.json({
    success: true,
    users: result.rows
  });
}));

// Device activity (admin only)
router.get('/activity/devices', requireAdmin, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  
  const result = await pool.query(
    `SELECT 
      d.device_id, d.device_type, d.name, d.is_online, d.last_seen, d.firmware_version,
      u.email as owner_email,
      (SELECT COUNT(*) FROM sensor_readings WHERE device_id = d.device_id AND ts > NOW() - INTERVAL '24 hours') as readings_24h
    FROM devices d
    LEFT JOIN users u ON d.user_id = u.id
    ORDER BY d.last_seen DESC NULLS LAST
    LIMIT $1`,
    [limit]
  );
  
  res.json({
    success: true,
    devices: result.rows
  });
}));

module.exports = router;
