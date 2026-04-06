const express = require('express');
const { body, param, query } = require('express-validator');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const db = require('../db/pool');
const logger = require('../utils/logger');
const mqttClient = require('../services/mqttClient');
const { authenticateToken } = require('./auth');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { handleValidationErrors } = require('../middleware/requestValidator');

const router = express.Router();
router.use(authenticateToken);

// Firmware storage path
const FIRMWARE_PATH = process.env.FIRMWARE_PATH || './firmware_files';

// Get available firmware versions
router.get('/versions', asyncHandler(async (req, res) => {
  const { deviceType } = req.query;
  
  let query = 'SELECT * FROM firmware_versions WHERE 1=1';
  const params = [];
  
  if (deviceType) {
    query += ' AND device_type = $1';
    params.push(deviceType);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await db.query(query, params);
  
  res.json({
    success: true,
    versions: result.rows
  });
}));

// Get latest firmware version for device
router.get('/latest/:deviceType', asyncHandler(async (req, res) => {
  const { deviceType } = req.params;
  
  if (!['guardian', 'buddy'].includes(deviceType)) {
    throw new ValidationError('Invalid device type');
  }
  
  const result = await db.query(
    `SELECT * FROM firmware_versions 
     WHERE device_type = $1 AND is_stable = true
     ORDER BY version DESC LIMIT 1`,
    [deviceType]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('Firmware version');
  }
  
  res.json({
    success: true,
    version: result.rows[0]
  });
}));

// Upload new firmware version
router.post('/upload', [
  body('version').matches(/^\d+\.\d+\.\d+$/).withMessage('Version must be in format x.x.x'),
  body('deviceType').isIn(['guardian', 'buddy']),
  body('changelog').optional().trim(),
  body('isStable').optional().isBoolean(),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const { version, deviceType, changelog = '', isStable = false } = req.body;
  
  // Check if version already exists
  const existing = await db.query(
    'SELECT id FROM firmware_versions WHERE version = $1 AND device_type = $2',
    [version, deviceType]
  );
  
  if (existing.rows.length > 0) {
    throw new ValidationError('Firmware version already exists');
  }
  
  // Create firmware directory if not exists
  const firmwareDir = path.join(FIRMWARE_PATH, deviceType);
  await fs.mkdir(firmwareDir, { recursive: true });
  
  // Store firmware info in database
  const result = await db.query(
    `INSERT INTO firmware_versions (version, device_type, changelog, is_stable, file_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [version, deviceType, changelog, isStable, firmwareDir, req.user.userId]
  );
  
  logger.info(`Firmware uploaded: ${deviceType} v${version} by user ${req.user.userId}`);
  
  res.status(201).json({
    success: true,
    version: result.rows[0]
  });
}));

// Trigger OTA update for device
router.post('/update/:deviceId', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  body('version').matches(/^\d+\.\d+\.\d+$/),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { version } = req.body;
  
  // Verify device belongs to user
  const deviceResult = await db.query(
    'SELECT device_id, device_type FROM devices WHERE device_id = $1 AND user_id = $2',
    [deviceId, req.user.userId]
  );
  
  if (deviceResult.rows.length === 0) {
    throw new NotFoundError('Device');
  }
  
  const device = deviceResult.rows[0];
  
  // Verify firmware version exists
  const firmwareResult = await db.query(
    'SELECT * FROM firmware_versions WHERE version = $1 AND device_type = $2',
    [version, device.device_type]
  );
  
  if (firmwareResult.rows.length === 0) {
    throw new NotFoundError('Firmware version');
  }
  
  const firmware = firmwareResult.rows[0];
  
  // Create OTA update record
  const updateResult = await db.query(
    `INSERT INTO ota_updates (device_id, firmware_version, status, initiated_by)
     VALUES ($1, $2, 'pending', $3) RETURNING *`,
    [deviceId, version, req.user.userId]
  );
  
  const updateId = updateResult.rows[0].id;
  
  // Send OTA command via MQTT
  const otaMessage = {
    command: 'ota_update',
    payload: {
      updateId,
      version,
      url: `${process.env.API_URL}/firmware/download/${firmware.id}`,
      checksum: firmware.checksum
    },
    timestamp: Date.now()
  };
  
  const sent = mqttClient.sendCommand(deviceId, 'ota_update', otaMessage.payload);
  
  if (!sent) {
    // Update status to failed
    await db.query(
      "UPDATE ota_updates SET status = 'failed', error_message = 'MQTT not connected' WHERE id = $1",
      [updateId]
    );
    throw new Error('Failed to send OTA command: MQTT not connected');
  }
  
  logger.info(`OTA update initiated for ${deviceId} to version ${version}`);
  
  res.json({
    success: true,
    update: updateResult.rows[0],
    message: 'OTA update initiated'
  });
}));

// Get OTA update status
router.get('/update-status/:updateId', asyncHandler(async (req, res) => {
  const { updateId } = req.params;
  
  const result = await db.query(
    `SELECT ou.*, d.name as device_name, d.device_id
     FROM ota_updates ou
     JOIN devices d ON ou.device_id = d.device_id
     WHERE ou.id = $1 AND d.user_id = $2`,
    [updateId, req.user.userId]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('OTA update');
  }
  
  res.json({
    success: true,
    update: result.rows[0]
  });
}));

// Handle OTA progress updates from devices
router.post('/progress/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { updateId, status, progress, error } = req.body;
  
  // Verify device
  const deviceResult = await db.query(
    'SELECT device_id FROM devices WHERE device_id = $1',
    [deviceId]
  );
  
  if (deviceResult.rows.length === 0) {
    throw new NotFoundError('Device');
  }
  
  // Update OTA status
  const updates = ['status = $1', 'progress = $2', 'updated_at = NOW()'];
  const values = [status, progress || 0];
  let paramIndex = 3;
  
  if (error) {
    updates.push(`error_message = $${paramIndex++}`);
    values.push(error);
  }
  
  if (status === 'completed') {
    updates.push('completed_at = NOW()');
    
    // Update device firmware version
    const updateResult = await db.query(
      'SELECT firmware_version FROM ota_updates WHERE id = $1',
      [updateId]
    );
    
    if (updateResult.rows.length > 0) {
      await db.query(
        'UPDATE devices SET firmware_version = $1 WHERE device_id = $2',
        [updateResult.rows[0].firmware_version, deviceId]
      );
    }
  }
  
  values.push(updateId);
  
  await db.query(
    `UPDATE ota_updates SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
  
  logger.info(`OTA progress for ${deviceId}: ${status} (${progress}%)`);
  
  res.json({ success: true });
}));

// Get OTA history for device
router.get('/history/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { limit = 10 } = req.query;
  
  // Verify device belongs to user
  const deviceResult = await db.query(
    'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
    [deviceId, req.user.userId]
  );
  
  if (deviceResult.rows.length === 0) {
    throw new NotFoundError('Device');
  }
  
  const result = await db.query(
    `SELECT * FROM ota_updates 
     WHERE device_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [deviceId, limit]
  );
  
  res.json({
    success: true,
    updates: result.rows
  });
}));

module.exports = router;
