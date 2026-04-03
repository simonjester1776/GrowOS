const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db/pool');
const mqttClient = require('../services/mqttClient');
const logger = require('../utils/logger');
const { authenticateToken } = require('./auth');

const router = express.Router();
router.use(authenticateToken);

// Get relay states for a device
router.get('/:deviceId', [
  param('deviceId').isLength({ min: 3, max: 32 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const result = await db.query(
      `SELECT * FROM relay_states 
       WHERE device_id = $1 
       ORDER BY relay_index`,
      [deviceId]
    );

    res.json({ relays: result.rows });
  } catch (err) {
    logger.error('Failed to fetch relay states:', err);
    res.status(500).json({ error: 'Failed to fetch relay states' });
  }
});

// Toggle relay
router.post('/:deviceId/:relayIndex/toggle', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  param('relayIndex').isInt({ min: 0, max: 3 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId, relayIndex } = req.params;

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
    const sent = mqttClient.sendCommand(deviceId, 'relay_toggle', { 
      relay: parseInt(relayIndex) 
    });

    if (!sent) {
      return res.status(503).json({ error: 'MQTT not connected' });
    }

    // Log the action
    await db.query(
      `INSERT INTO relay_history (device_id, relay_index, action, triggered_by)
       VALUES ($1, $2, 'toggle', 'user')`,
      [deviceId, relayIndex]
    );

    res.json({ message: 'Relay toggle command sent', deviceId, relayIndex });
  } catch (err) {
    logger.error('Failed to toggle relay:', err);
    res.status(500).json({ error: 'Failed to toggle relay' });
  }
});

// Set relay state
router.post('/:deviceId/:relayIndex/set', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  param('relayIndex').isInt({ min: 0, max: 3 }),
  body('state').isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId, relayIndex } = req.params;
  const { state } = req.body;

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
    const command = state ? 'relay_on' : 'relay_off';
    const sent = mqttClient.sendCommand(deviceId, command, { 
      relay: parseInt(relayIndex) 
    });

    if (!sent) {
      return res.status(503).json({ error: 'MQTT not connected' });
    }

    // Log the action
    await db.query(
      `INSERT INTO relay_history (device_id, relay_index, action, triggered_by)
       VALUES ($1, $2, $3, 'user')`,
      [deviceId, relayIndex, state ? 'on' : 'off']
    );

    res.json({ message: `Relay ${state ? 'on' : 'off'} command sent`, deviceId, relayIndex, state });
  } catch (err) {
    logger.error('Failed to set relay state:', err);
    res.status(500).json({ error: 'Failed to set relay state' });
  }
});

// Update relay configuration
router.patch('/:deviceId/:relayIndex/config', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  param('relayIndex').isInt({ min: 0, max: 3 }),
  body('name').optional().trim(),
  body('autoMode').optional().isBoolean(),
  body('schedule').optional().isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId, relayIndex } = req.params;
  const { name, autoMode, schedule } = req.body;

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`relay_name = $${paramIndex++}`);
      values.push(name);
    }
    if (autoMode !== undefined) {
      setClauses.push(`auto_mode = $${paramIndex++}`);
      values.push(autoMode);
    }
    if (schedule !== undefined) {
      setClauses.push(`schedule = $${paramIndex++}`);
      values.push(JSON.stringify(schedule));
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(deviceId);
    values.push(relayIndex);

    const result = await db.query(
      `INSERT INTO relay_states (device_id, relay_index, relay_name, auto_mode, schedule)
       VALUES ($${paramIndex++}, $${paramIndex++}, $1, $2, $3)
       ON CONFLICT (device_id, relay_index) DO UPDATE SET
         ${setClauses.join(', ')},
         updated_at = NOW()
       RETURNING *`,
      [...values.slice(0, -2), deviceId, relayIndex]
    );

    res.json({ relay: result.rows[0] });
  } catch (err) {
    logger.error('Failed to update relay config:', err);
    res.status(500).json({ error: 'Failed to update relay configuration' });
  }
});

// Get relay history
router.get('/:deviceId/history', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  body('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const result = await db.query(
      `SELECT * FROM relay_history 
       WHERE device_id = $1 
       ORDER BY created_at DESC
       LIMIT $2`,
      [deviceId, limit]
    );

    res.json({ history: result.rows });
  } catch (err) {
    logger.error('Failed to fetch relay history:', err);
    res.status(500).json({ error: 'Failed to fetch relay history' });
  }
});

module.exports = router;
