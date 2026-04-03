const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db/pool');
const mqttClient = require('../services/mqttClient');
const logger = require('../utils/logger');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);

// List user's devices
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, 
        (SELECT COUNT(*) FROM device_relationships WHERE guardian_id = d.device_id) as buddy_count
       FROM devices d 
       WHERE d.user_id = $1 
       ORDER BY d.created_at DESC`,
      [req.user.userId]
    );

    res.json({ devices: result.rows });
  } catch (err) {
    logger.error('Failed to fetch devices:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Get single device with details
router.get('/:deviceId', [
  param('deviceId').isLength({ min: 3, max: 32 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;

  try {
    // Get device
    const deviceResult = await db.query(
      `SELECT d.* FROM devices d 
       WHERE d.device_id = $1 AND d.user_id = $2`,
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = deviceResult.rows[0];

    // Get connected buddies if guardian
    let buddies = [];
    if (device.device_type === 'guardian') {
      const buddiesResult = await db.query(
        `SELECT d.* FROM devices d
         JOIN device_relationships dr ON d.device_id = dr.buddy_id
         WHERE dr.guardian_id = $1`,
        [deviceId]
      );
      buddies = buddiesResult.rows;
    }

    // Get relay states
    const relaysResult = await db.query(
      `SELECT * FROM relay_states WHERE device_id = $1 ORDER BY relay_index`,
      [deviceId]
    );

    res.json({
      device,
      buddies,
      relays: relaysResult.rows
    });
  } catch (err) {
    logger.error('Failed to fetch device:', err);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// Register new device
router.post('/register', [
  body('deviceId').isLength({ min: 3, max: 32 }),
  body('deviceType').isIn(['guardian', 'buddy']),
  body('name').optional().trim(),
  body('location').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId, deviceType, name, location } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO devices (device_id, device_type, name, location, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_id) DO UPDATE SET
         user_id = $5,
         name = COALESCE($3, devices.name),
         location = COALESCE($4, devices.location),
         updated_at = NOW()
       RETURNING *`,
      [deviceId, deviceType, name, location, req.user.userId]
    );

    res.status(201).json({ device: result.rows[0] });
  } catch (err) {
    logger.error('Failed to register device:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// Update device
router.patch('/:deviceId', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  body('name').optional().trim(),
  body('location').optional().trim(),
  body('config').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const { name, location, config } = req.body;

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    if (config !== undefined) {
      updates.push(`config = config || $${paramIndex++}`);
      values.push(JSON.stringify(config));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(deviceId);
    values.push(req.user.userId);

    const result = await db.query(
      `UPDATE devices SET ${updates.join(', ')}, updated_at = NOW()
       WHERE device_id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device: result.rows[0] });
  } catch (err) {
    logger.error('Failed to update device:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
router.delete('/:deviceId', [
  param('deviceId').isLength({ min: 3, max: 32 })
], async (req, res) => {
  const { deviceId } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM devices WHERE device_id = $1 AND user_id = $2 RETURNING id',
      [deviceId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device deleted' });
  } catch (err) {
    logger.error('Failed to delete device:', err);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Link buddy to guardian
router.post('/:guardianId/buddies/:buddyId', [
  param('guardianId').isLength({ min: 3, max: 32 }),
  param('buddyId').isLength({ min: 3, max: 32 })
], async (req, res) => {
  const { guardianId, buddyId } = req.params;

  try {
    // Verify both devices belong to user
    const devicesResult = await db.query(
      `SELECT device_id, device_type FROM devices 
       WHERE device_id IN ($1, $2) AND user_id = $3`,
      [guardianId, buddyId, req.user.userId]
    );

    if (devicesResult.rows.length !== 2) {
      return res.status(404).json({ error: 'One or both devices not found' });
    }

    const guardian = devicesResult.rows.find(d => d.device_id === guardianId);
    const buddy = devicesResult.rows.find(d => d.device_id === buddyId);

    if (!guardian || guardian.device_type !== 'guardian') {
      return res.status(400).json({ error: 'Invalid guardian device' });
    }
    if (!buddy || buddy.device_type !== 'buddy') {
      return res.status(400).json({ error: 'Invalid buddy device' });
    }

    await db.query(
      `INSERT INTO device_relationships (guardian_id, buddy_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [guardianId, buddyId]
    );

    res.json({ message: 'Buddy linked to guardian' });
  } catch (err) {
    logger.error('Failed to link devices:', err);
    res.status(500).json({ error: 'Failed to link devices' });
  }
});

// Unlink buddy from guardian
router.delete('/:guardianId/buddies/:buddyId', async (req, res) => {
  const { guardianId, buddyId } = req.params;

  try {
    await db.query(
      `DELETE FROM device_relationships 
       WHERE guardian_id = $1 AND buddy_id = $2`,
      [guardianId, buddyId]
    );

    res.json({ message: 'Buddy unlinked from guardian' });
  } catch (err) {
    logger.error('Failed to unlink devices:', err);
    res.status(500).json({ error: 'Failed to unlink devices' });
  }
});

// Send command to device
router.post('/:deviceId/command', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  body('command').isIn(['relay_on', 'relay_off', 'relay_toggle', 'reboot', 'update_config']),
  body('payload').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const { command, payload = {} } = req.body;

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Send command via MQTT
    const sent = mqttClient.sendCommand(deviceId, command, payload);

    if (!sent) {
      return res.status(503).json({ error: 'MQTT not connected, command queued' });
    }

    res.json({ message: 'Command sent', command });
  } catch (err) {
    logger.error('Failed to send command:', err);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

module.exports = router;
