const express = require('express');
const { param, query, validationResult } = require('express-validator');
const db = require('../db/pool');
const logger = require('../utils/logger');
const { authenticateToken } = require('./auth');

const router = express.Router();
router.use(authenticateToken);

// Get latest sensor readings for a device
router.get('/:deviceId/latest', [
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
      `SELECT * FROM sensor_readings 
       WHERE device_id = $1 
       ORDER BY ts DESC 
       LIMIT 1`,
      [deviceId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'No sensor data available', data: null });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('Failed to fetch latest sensor data:', err);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// Get sensor history with aggregation
router.get('/:deviceId/history', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  query('hours').optional().isInt({ min: 1, max: 720 }),
  query('days').optional().isInt({ min: 1, max: 90 }),
  query('metric').optional().isIn(['co2', 'temperature', 'humidity', 'pressure', 'lux', 'voc', 'vpd', 'moisture', 'soil_temp', 'ec', 'ph']),
  query('interval').optional().isIn(['raw', '1m', '5m', '15m', '1h', '1d'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const hours = parseInt(req.query.hours) || (parseInt(req.query.days) * 24) || 24;
  const metric = req.query.metric;
  const interval = req.query.interval || 'raw';

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    let query;
    let params = [deviceId, hours];

    if (interval === 'raw') {
      // Raw data, limited to prevent huge responses
      query = `
        SELECT * FROM sensor_readings 
        WHERE device_id = $1 
        AND ts > NOW() - INTERVAL '${hours} hours'
        ORDER BY ts DESC
        LIMIT 10000
      `;
    } else {
      // Aggregated data using time buckets
      const bucketMap = {
        '1m': '1 minute',
        '5m': '5 minutes',
        '15m': '15 minutes',
        '1h': '1 hour',
        '1d': '1 day'
      };
      const bucket = bucketMap[interval];

      if (metric) {
        // Single metric aggregation
        query = `
          SELECT 
            time_bucket('${bucket}', ts) as bucket,
            AVG(${metric}) as avg_${metric},
            MIN(${metric}) as min_${metric},
            MAX(${metric}) as max_${metric},
            COUNT(*) as sample_count
          FROM sensor_readings 
          WHERE device_id = $1 
          AND ts > NOW() - INTERVAL '${hours} hours'
          AND ${metric} IS NOT NULL
          GROUP BY bucket
          ORDER BY bucket DESC
        `;
      } else {
        // All metrics aggregation
        query = `
          SELECT 
            time_bucket('${bucket}', ts) as bucket,
            AVG(co2) as avg_co2,
            AVG(temperature) as avg_temperature,
            AVG(humidity) as avg_humidity,
            AVG(pressure) as avg_pressure,
            AVG(lux) as avg_lux,
            AVG(voc_index) as avg_voc,
            AVG(vpd) as avg_vpd,
            AVG(moisture) as avg_moisture,
            AVG(soil_temp) as avg_soil_temp,
            AVG(ec) as avg_ec,
            COUNT(*) as sample_count
          FROM sensor_readings 
          WHERE device_id = $1 
          AND ts > NOW() - INTERVAL '${hours} hours'
          GROUP BY bucket
          ORDER BY bucket DESC
        `;
      }
    }

    const result = await db.query(query, params);

    res.json({
      deviceId,
      hours,
      metric: metric || 'all',
      interval,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    logger.error('Failed to fetch sensor history:', err);
    res.status(500).json({ error: 'Failed to fetch sensor history' });
  }
});

// Get sensor statistics
router.get('/:deviceId/stats', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  query('hours').optional().isInt({ min: 1, max: 720 }),
  query('days').optional().isInt({ min: 1, max: 90 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const hours = parseInt(req.query.hours) || (parseInt(req.query.days) * 24) || 24;

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
      `SELECT 
        COUNT(*) as total_readings,
        AVG(co2) as avg_co2,
        MIN(co2) as min_co2,
        MAX(co2) as max_co2,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(humidity) as avg_humidity,
        MIN(humidity) as min_humidity,
        MAX(humidity) as max_humidity,
        AVG(pressure) as avg_pressure,
        AVG(lux) as avg_lux,
        AVG(vpd) as avg_vpd,
        AVG(moisture) as avg_moisture,
        AVG(soil_temp) as avg_soil_temp,
        AVG(ec) as avg_ec
      FROM sensor_readings 
      WHERE device_id = $1 
      AND ts > NOW() - INTERVAL '${hours} hours'`,
      [deviceId]
    );

    res.json({
      deviceId,
      hours,
      stats: result.rows[0]
    });
  } catch (err) {
    logger.error('Failed to fetch sensor stats:', err);
    res.status(500).json({ error: 'Failed to fetch sensor statistics' });
  }
});

// Export sensor data
router.get('/:deviceId/export', [
  param('deviceId').isLength({ min: 3, max: 32 }),
  query('format').optional().isIn(['csv', 'json']),
  query('days').optional().isInt({ min: 1, max: 30 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { deviceId } = req.params;
  const format = req.query.format || 'json';
  const days = parseInt(req.query.days) || 7;

  try {
    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT device_id, name FROM devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, req.user.userId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceName = deviceResult.rows[0].name || deviceId;

    const result = await db.query(
      `SELECT * FROM sensor_readings 
       WHERE device_id = $1 
       AND ts > NOW() - INTERVAL '${days} days'
       ORDER BY ts DESC`,
      [deviceId]
    );

    if (format === 'csv') {
      // Generate CSV
      const headers = ['timestamp', 'co2', 'temperature', 'humidity', 'pressure', 'lux', 'voc_index', 'vpd', 'moisture', 'soil_temp', 'ec', 'ph'];
      const csvRows = [headers.join(',')];
      
      for (const row of result.rows) {
        const values = headers.map(h => {
          if (h === 'timestamp') return row.ts;
          return row[h] !== null ? row[h] : '';
        });
        csvRows.push(values.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${deviceName}_sensor_data.csv"`);
      res.send(csvRows.join('\n'));
    } else {
      res.json({
        deviceId,
        deviceName,
        days,
        count: result.rows.length,
        data: result.rows
      });
    }
  } catch (err) {
    logger.error('Failed to export sensor data:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
