const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db/pool');
const logger = require('../utils/logger');
const { authenticateToken } = require('./auth');

const router = express.Router();
router.use(authenticateToken);

// Get alert rules for a device
router.get('/rules/:deviceId', [
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
      `SELECT * FROM alert_rules 
       WHERE device_id = $1 
       ORDER BY created_at DESC`,
      [deviceId]
    );

    res.json({ rules: result.rows });
  } catch (err) {
    logger.error('Failed to fetch alert rules:', err);
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

// Create alert rule
router.post('/rules', [
  body('deviceId').isLength({ min: 3, max: 32 }),
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('metric').isIn(['co2', 'temperature', 'humidity', 'pressure', 'lux', 'voc', 'vpd', 'moisture', 'soil_temp', 'ec', 'ph']),
  body('operator').isIn(['gt', 'lt', 'eq', 'between']),
  body('thresholdValue').optional().isFloat(),
  body('thresholdMin').optional().isFloat(),
  body('thresholdMax').optional().isFloat(),
  body('durationMinutes').optional().isInt({ min: 0 }),
  body('notifyPush').optional().isBoolean(),
  body('notifyEmail').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    deviceId,
    name,
    metric,
    operator,
    thresholdValue,
    thresholdMin,
    thresholdMax,
    durationMinutes,
    notifyPush,
    notifyEmail
  } = req.body;

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
      `INSERT INTO alert_rules 
        (device_id, name, metric, operator, threshold_value, threshold_min, threshold_max, duration_minutes, notify_push, notify_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [deviceId, name, metric, operator, thresholdValue, thresholdMin, thresholdMax, durationMinutes, notifyPush ?? true, notifyEmail ?? false]
    );

    res.status(201).json({ rule: result.rows[0] });
  } catch (err) {
    logger.error('Failed to create alert rule:', err);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

// Update alert rule
router.patch('/rules/:ruleId', [
  param('ruleId').isInt(),
  body('name').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('thresholdValue').optional().isFloat(),
  body('notifyPush').optional().isBoolean(),
  body('notifyEmail').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { ruleId } = req.params;
  const updates = req.body;

  try {
    // Verify rule belongs to user's device
    const checkResult = await db.query(
      `SELECT ar.id FROM alert_rules ar
       JOIN devices d ON ar.device_id = d.device_id
       WHERE ar.id = $1 AND d.user_id = $2`,
      [ruleId, req.user.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      values.push(updates.isActive);
    }
    if (updates.thresholdValue !== undefined) {
      setClauses.push(`threshold_value = $${paramIndex++}`);
      values.push(updates.thresholdValue);
    }
    if (updates.notifyPush !== undefined) {
      setClauses.push(`notify_push = $${paramIndex++}`);
      values.push(updates.notifyPush);
    }
    if (updates.notifyEmail !== undefined) {
      setClauses.push(`notify_email = $${paramIndex++}`);
      values.push(updates.notifyEmail);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(ruleId);

    const result = await db.query(
      `UPDATE alert_rules SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json({ rule: result.rows[0] });
  } catch (err) {
    logger.error('Failed to update alert rule:', err);
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

// Delete alert rule
router.delete('/rules/:ruleId', [
  param('ruleId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { ruleId } = req.params;

  try {
    // Verify rule belongs to user's device
    const checkResult = await db.query(
      `SELECT ar.id FROM alert_rules ar
       JOIN devices d ON ar.device_id = d.device_id
       WHERE ar.id = $1 AND d.user_id = $2`,
      [ruleId, req.user.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    await db.query('DELETE FROM alert_rules WHERE id = $1', [ruleId]);

    res.json({ message: 'Alert rule deleted' });
  } catch (err) {
    logger.error('Failed to delete alert rule:', err);
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

// Get alert history
router.get('/history', [
  query('deviceId').optional().isLength({ min: 3, max: 32 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('unacknowledged').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId, limit = 50, offset = 0, unacknowledged } = req.query;

  try {
    let whereClause = 'WHERE d.user_id = $1';
    const params = [req.user.userId];
    let paramIndex = 2;

    if (deviceId) {
      whereClause += ` AND ah.device_id = $${paramIndex++}`;
      params.push(deviceId);
    }

    if (unacknowledged === 'true') {
      whereClause += ' AND ah.acknowledged_at IS NULL';
    }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const result = await db.query(
      `SELECT ah.*, d.name as device_name, ar.name as rule_name
       FROM alert_history ah
       JOIN devices d ON ah.device_id = d.device_id
       LEFT JOIN alert_rules ar ON ah.rule_id = ar.id
       ${whereClause}
       ORDER BY ah.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM alert_history ah
       JOIN devices d ON ah.device_id = d.device_id
       ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      alerts: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    logger.error('Failed to fetch alert history:', err);
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
});

// Acknowledge alert
router.post('/history/:alertId/acknowledge', [
  param('alertId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { alertId } = req.params;

  try {
    const result = await db.query(
      `UPDATE alert_history ah
       SET acknowledged_at = NOW(), acknowledged_by = $1
       FROM devices d
       WHERE ah.id = $2 AND ah.device_id = d.device_id AND d.user_id = $3
       RETURNING ah.*`,
      [req.user.userId, alertId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert: result.rows[0] });
  } catch (err) {
    logger.error('Failed to acknowledge alert:', err);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
router.post('/history/:alertId/resolve', [
  param('alertId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { alertId } = req.params;

  try {
    const result = await db.query(
      `UPDATE alert_history ah
       SET resolved_at = NOW()
       FROM devices d
       WHERE ah.id = $1 AND ah.device_id = d.device_id AND d.user_id = $2
       RETURNING ah.*`,
      [alertId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert: result.rows[0] });
  } catch (err) {
    logger.error('Failed to resolve alert:', err);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

module.exports = router;
