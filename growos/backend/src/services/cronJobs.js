const cron = require('node-cron');
const logger = require('../utils/logger');
const db = require('../db/pool');

function start() {
  // Mark offline devices (no heartbeat for 5 minutes)
  cron.schedule('*/2 * * * *', async () => {
    try {
      const result = await db.query(
        `UPDATE devices 
         SET is_online = false 
         WHERE last_seen < NOW() - INTERVAL '5 minutes' 
         AND is_online = true
         RETURNING device_id`
      );
      
      if (result.rowCount > 0) {
        logger.info(`Marked ${result.rowCount} devices as offline`);
      }
    } catch (err) {
      logger.error('Cron: Failed to mark offline devices:', err);
    }
  });

  // Clean up old sensor readings (keep 90 days)
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await db.query(
        `DELETE FROM sensor_readings 
         WHERE ts < NOW() - INTERVAL '90 days'`
      );
      logger.info(`Cron: Cleaned up ${result.rowCount} old sensor readings`);
    } catch (err) {
      logger.error('Cron: Failed to clean up old readings:', err);
    }
  });

  // Clean up old alert history (keep 1 year)
  cron.schedule('0 4 * * 0', async () => {
    try {
      const result = await db.query(
        `DELETE FROM alert_history 
         WHERE created_at < NOW() - INTERVAL '1 year' 
         AND resolved_at IS NOT NULL`
      );
      logger.info(`Cron: Cleaned up ${result.rowCount} old alerts`);
    } catch (err) {
      logger.error('Cron: Failed to clean up old alerts:', err);
    }
  });

  // Generate daily aggregates
  cron.schedule('0 1 * * *', async () => {
    try {
      await generateDailyAggregates();
    } catch (err) {
      logger.error('Cron: Failed to generate daily aggregates:', err);
    }
  });

  logger.info('Cron jobs scheduled');
}

async function generateDailyAggregates() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  logger.info(`Generating daily aggregates for ${dateStr}`);

  // This could be expanded to populate a separate aggregates table
  // For now, we'll just log that it ran
}

module.exports = { start };
