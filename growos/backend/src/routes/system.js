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
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const logFile = path.join(logsDir, 'combined.log');
    
    // Read log file
    let logContent = '';
    try {
      logContent = await fs.readFile(logFile, 'utf-8');
    } catch (err) {
      logger.debug('Log file not found, returning empty logs');
      return res.json({
        success: true,
        logs: [],
        total: 0
      });
    }
    
    // Parse JSON logs
    const logs = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(log => log !== null && log.level >= level);
    
    // Filter by level and timestamp if provided
    let filtered = logs;
    if (since) {
      const sinceDate = new Date(since);
      filtered = logs.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate >= sinceDate;
      });
    }
    
    // Return limited results
    const results = filtered.slice(-Math.min(parseInt(limit) || 100, 1000));
    
    res.json({
      success: true,
      logs: results,
      total: filtered.length,
      returned: results.length
    });
  } catch (err) {
    logger.error('Error retrieving logs:', err);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
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
  try {
    // Create backups tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(50),
        status VARCHAR(50),
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        backup_path VARCHAR(255),
        backup_size BIGINT,
        error_message TEXT
      )
    `);
    
    // Get latest backups
    const result = await pool.query(`
      SELECT 
        id,
        backup_type,
        status,
        started_at,
        completed_at,
        backup_path,
        backup_size
      FROM backups
      ORDER BY started_at DESC
      LIMIT 5
    `);
    
    const lastBackup = result.rows[0];
    
    res.json({
      success: true,
      backup: {
        lastBackup: lastBackup ? {
          id: lastBackup.id,
          type: lastBackup.backup_type,
          status: lastBackup.status,
          startedAt: lastBackup.started_at,
          completedAt: lastBackup.completed_at,
          size: lastBackup.backup_size,
          path: lastBackup.backup_path
        } : null,
        nextScheduled: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: lastBackup ? lastBackup.status : 'never_run',
        totalBackups: result.rows.length
      }
    });
  } catch (err) {
    logger.error('Error checking backup status:', err);
    res.status(500).json({ error: 'Failed to check backup status' });
  }
}));

// Trigger backup (admin only)
router.post('/backup/trigger', requireAdmin, asyncHandler(async (req, res) => {
  const { type = 'full' } = req.body;
  
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const fs = require('fs').promises;
    const path = require('path');
    
    const execAsync = promisify(exec);
    const backupId = `backup-${Date.now()}`;
    const backupDir = path.join(process.cwd(), 'backups');
    const backupPath = path.join(backupDir, `${backupId}.sql`);
    
    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });
    
    // Record backup start in database
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(50),
        status VARCHAR(50),
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        backup_path VARCHAR(255),
        backup_size BIGINT,
        error_message TEXT
      )
    `);
    
    const backupRecord = await pool.query(
      `INSERT INTO backups (backup_type, status, backup_path) 
       VALUES ($1, 'in_progress', $2) RETURNING id`,
      [type, backupPath]
    );
    const recordId = backupRecord.rows[0].id;
    
    logger.info(`Backup ${recordId} triggered: ${type}`);
    
    // Create database dump using pg_dump
    const dbUrl = process.env.DATABASE_URL || 'postgresql://growos:growos_dev@localhost:5432/growos';
    const dumpCmd = `pg_dump "${dbUrl}" > "${backupPath}"`;
    
    try {
      await execAsync(dumpCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      // Get backup file size
      const stats = await fs.stat(backupPath);
      
      // Update backup record to completed
      await pool.query(
        `UPDATE backups 
         SET status = 'completed', completed_at = NOW(), backup_size = $1
         WHERE id = $2`,
        [stats.size, recordId]
      );
      
      logger.info(`Backup ${recordId} completed successfully. Size: ${stats.size} bytes`);
      
      res.json({
        success: true,
        message: 'Backup completed successfully',
        backup: {
          id: recordId,
          backupId,
          type,
          status: 'completed',
          path: backupPath,
          size: stats.size
        }
      });
    } catch (execErr) {
      // Update backup record to failed
      await pool.query(
        `UPDATE backups 
         SET status = 'failed', completed_at = NOW(), error_message = $1
         WHERE id = $2`,
        [execErr.message, recordId]
      );
      
      logger.error(`Backup ${recordId} failed:`, execErr);
      throw execErr;
    }
  } catch (err) {
    logger.error('Backup trigger error:', err);
    res.status(500).json({ 
      error: 'Backup failed',
      message: err.message 
    });
  }
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
