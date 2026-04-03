const express = require('express');
const db = require('../db/pool');
const logger = require('../utils/logger');
const { authenticateToken } = require('./auth');

const router = express.Router();
router.use(authenticateToken);

// Get dashboard overview
router.get('/overview', async (req, res) => {
  try {
    // Get user's devices summary
    const devicesResult = await db.query(
      `SELECT 
        COUNT(*) as total_devices,
        COUNT(CASE WHEN device_type = 'guardian' THEN 1 END) as guardians,
        COUNT(CASE WHEN device_type = 'buddy' THEN 1 END) as buddies,
        COUNT(CASE WHEN is_online = true THEN 1 END) as online_devices
      FROM devices 
      WHERE user_id = $1`,
      [req.user.userId]
    );

    // Get recent alerts count
    const alertsResult = await db.query(
      `SELECT COUNT(*) as unacknowledged_alerts
       FROM alert_history ah
       JOIN devices d ON ah.device_id = d.device_id
       WHERE d.user_id = $1 AND ah.acknowledged_at IS NULL`,
      [req.user.userId]
    );

    // Get latest readings from each guardian
    const latestResult = await db.query(
      `SELECT DISTINCT ON (sr.device_id)
        sr.device_id,
        d.name as device_name,
        sr.co2,
        sr.temperature,
        sr.humidity,
        sr.ts
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.device_id
      WHERE d.user_id = $1 AND d.device_type = 'guardian'
      ORDER BY sr.device_id, sr.ts DESC
      LIMIT 5`,
      [req.user.userId]
    );

    // Get devices needing attention (offline or low battery)
    const attentionResult = await db.query(
      `SELECT device_id, name, device_type, last_seen, battery_voltage, is_online
       FROM devices
       WHERE user_id = $1 
       AND (is_online = false OR battery_voltage < 3.3)
       ORDER BY last_seen DESC
       LIMIT 5`,
      [req.user.userId]
    );

    res.json({
      summary: {
        ...devicesResult.rows[0],
        unacknowledgedAlerts: parseInt(alertsResult.rows[0].unacknowledged_alerts)
      },
      latestReadings: latestResult.rows,
      needsAttention: attentionResult.rows
    });
  } catch (err) {
    logger.error('Failed to fetch dashboard overview:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get environmental summary (avg stats for time period)
router.get('/environment', async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;

  try {
    const result = await db.query(
      `SELECT 
        AVG(sr.temperature) as avg_temp,
        MIN(sr.temperature) as min_temp,
        MAX(sr.temperature) as max_temp,
        AVG(sr.humidity) as avg_humidity,
        MIN(sr.humidity) as min_humidity,
        MAX(sr.humidity) as max_humidity,
        AVG(sr.co2) as avg_co2,
        MAX(sr.co2) as max_co2,
        AVG(sr.vpd) as avg_vpd,
        AVG(sr.moisture) as avg_moisture
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.device_id
      WHERE d.user_id = $1 
      AND sr.ts > NOW() - INTERVAL '${hours} hours'`,
      [req.user.userId]
    );

    res.json({
      hours,
      environment: result.rows[0]
    });
  } catch (err) {
    logger.error('Failed to fetch environment data:', err);
    res.status(500).json({ error: 'Failed to fetch environment data' });
  }
});

// Get VPD (Vapor Pressure Deficit) analysis
router.get('/vpd-analysis', async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;

  try {
    // VPD ranges: <0.4 = too low, 0.4-0.8 = seedling, 0.8-1.2 = veg, 1.2-1.6 = flower, >1.6 = too high
    const result = await db.query(
      `SELECT 
        time_bucket('1 hour', sr.ts) as hour,
        AVG(sr.vpd) as avg_vpd,
        AVG(sr.temperature) as avg_temp,
        AVG(sr.humidity) as avg_humidity,
        COUNT(*) as readings
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.device_id
      WHERE d.user_id = $1 
      AND sr.ts > NOW() - INTERVAL '${hours} hours'
      AND sr.vpd IS NOT NULL
      GROUP BY hour
      ORDER BY hour DESC`,
      [req.user.userId]
    );

    // Calculate time in each VPD zone
    const zoneResult = await db.query(
      `SELECT 
        COUNT(CASE WHEN vpd < 0.4 THEN 1 END) as too_low,
        COUNT(CASE WHEN vpd >= 0.4 AND vpd < 0.8 THEN 1 END) as seedling_range,
        COUNT(CASE WHEN vpd >= 0.8 AND vpd < 1.2 THEN 1 END) as veg_range,
        COUNT(CASE WHEN vpd >= 1.2 AND vpd < 1.6 THEN 1 END) as flower_range,
        COUNT(CASE WHEN vpd >= 1.6 THEN 1 END) as too_high,
        COUNT(*) as total
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.device_id
      WHERE d.user_id = $1 
      AND sr.ts > NOW() - INTERVAL '${hours} hours'
      AND sr.vpd IS NOT NULL`,
      [req.user.userId]
    );

    res.json({
      hours,
      hourlyData: result.rows,
      zoneDistribution: zoneResult.rows[0]
    });
  } catch (err) {
    logger.error('Failed to fetch VPD analysis:', err);
    res.status(500).json({ error: 'Failed to fetch VPD analysis' });
  }
});

// Get device activity timeline
router.get('/activity', async (req, res) => {
  const days = parseInt(req.query.days) || 7;

  try {
    const result = await db.query(
      `SELECT 
        DATE(sr.ts) as date,
        COUNT(*) as total_readings,
        COUNT(DISTINCT sr.device_id) as active_devices
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.device_id
      WHERE d.user_id = $1 
      AND sr.ts > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(sr.ts)
      ORDER BY date DESC`,
      [req.user.userId]
    );

    res.json({
      days,
      activity: result.rows
    });
  } catch (err) {
    logger.error('Failed to fetch activity data:', err);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
});

module.exports = router;
