const mqtt = require('mqtt');
const logger = require('../utils/logger');
const db = require('../db/pool');

const TOPICS = [
  'growos/+/sensors',
  'growos/+/alerts', 
  'growos/+/status',
  'growos/+/buddy',
  'growos/+/command/ack'
];

let client = null;
let messageHandlers = new Map();

async function connect(app) {
  const host = process.env.MQTT_HOST || 'localhost';
  const port = process.env.MQTT_PORT || 1883;
  const url = `mqtt://${host}:${port}`;

  client = mqtt.connect(url, {
    clientId: `growos-backend-${Date.now()}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    clean: true
  });

  return new Promise((resolve, reject) => {
    client.on('connect', () => {
      logger.info(`MQTT connected to ${url}`);
      
      // Subscribe to all topics
      TOPICS.forEach(topic => {
        client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            logger.error(`Failed to subscribe to ${topic}:`, err);
          } else {
            logger.debug(`Subscribed to ${topic}`);
          }
        });
      });
      
      resolve();
    });

    client.on('message', async (topic, payload) => {
      try {
        await handleMessage(topic, payload, app);
      } catch (err) {
        logger.error('MQTT message handler error:', err);
      }
    });

    client.on('error', (err) => {
      logger.error('MQTT error:', err);
      reject(err);
    });

    client.on('reconnect', () => {
      logger.warn('MQTT reconnecting...');
    });

    client.on('offline', () => {
      logger.warn('MQTT client offline');
    });

    client.on('close', () => {
      logger.info('MQTT connection closed');
    });
  });
}

async function handleMessage(topic, payload, app) {
  const parts = topic.split('/');
  const deviceId = parts[1];
  const messageType = parts[2];
  
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch (e) {
    logger.warn(`Invalid JSON from ${deviceId}: ${payload.toString()}`);
    return;
  }

  logger.debug(`Received ${messageType} from ${deviceId}`);

  switch (messageType) {
    case 'sensors':
      await handleSensorMessage(deviceId, data, app);
      break;
    case 'buddy':
      await handleBuddyMessage(deviceId, data, app);
      break;
    case 'alerts':
      await handleAlertMessage(deviceId, data, app);
      break;
    case 'status':
      await handleStatusMessage(deviceId, data, app);
      break;
    case 'command':
      if (parts[3] === 'ack') {
        await handleCommandAck(deviceId, data, app);
      }
      break;
    default:
      logger.debug(`Unknown message type: ${messageType}`);
  }
}

async function handleSensorMessage(deviceId, data, app) {
  const io = app.get('io');
  
  try {
    // Update device last_seen
    await db.query(
      `UPDATE devices SET last_seen = NOW(), is_online = true, battery_voltage = $1, rssi = $2 WHERE device_id = $3`,
      [data.battery_v, data.rssi, deviceId]
    );

    // Insert sensor reading
    await db.query(
      `INSERT INTO sensor_readings 
        (device_id, ts, co2, temperature, humidity, pressure, lux, voc_index, vpd, battery_voltage)
       VALUES ($1, to_timestamp($2), $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        deviceId,
        data.ts || Date.now() / 1000,
        data.co2,
        data.temperature,
        data.humidity,
        data.pressure,
        data.lux,
        data.voc,
        data.vpd,
        data.battery_v
      ]
    );

    // Broadcast to WebSocket subscribers
    io?.to(`device:${deviceId}`).emit('sensor_update', { 
      deviceId, 
      timestamp: data.ts,
      co2: data.co2,
      temperature: data.temperature,
      humidity: data.humidity,
      pressure: data.pressure,
      lux: data.lux,
      voc: data.voc,
      vpd: data.vpd,
      battery_v: data.battery_v
    });

    // Check alert rules
    await evaluateAlertRules(deviceId, data, app);

  } catch (err) {
    logger.error('Failed to process sensor message:', err);
  }
}

async function handleBuddyMessage(deviceId, data, app) {
  const io = app.get('io');
  
  try {
    // Update buddy device
    await db.query(
      `UPDATE devices SET last_seen = NOW(), is_online = true, battery_voltage = $1, rssi = $2, snr = $3 WHERE device_id = $4`,
      [data.battery_v, data.rssi, data.snr, data.node_id]
    );

    // Insert buddy sensor reading
    await db.query(
      `INSERT INTO sensor_readings 
        (device_id, ts, moisture, soil_temp, ec, ph, battery_voltage)
       VALUES ($1, to_timestamp($2), $3, $4, $5, $6, $7)`,
      [
        data.node_id,
        data.timestamp || Date.now() / 1000,
        data.moisture,
        data.soil_temp,
        data.ec,
        data.ph,
        data.battery_v
      ]
    );

    // Broadcast to WebSocket
    io?.to(`device:${data.node_id}`).emit('buddy_update', {
      deviceId: data.node_id,
      guardianId: deviceId,
      timestamp: data.timestamp,
      moisture: data.moisture,
      soilTemp: data.soil_temp,
      ec: data.ec,
      ph: data.ph,
      battery_v: data.battery_v,
      rssi: data.rssi,
      snr: data.snr
    });

  } catch (err) {
    logger.error('Failed to process buddy message:', err);
  }
}

async function handleAlertMessage(deviceId, data, app) {
  const io = app.get('io');
  
  logger.warn(`Alert from ${deviceId}: ${JSON.stringify(data)}`);
  
  // Store alert in history
  try {
    await db.query(
      `INSERT INTO alert_history (device_id, metric, value, threshold_value, message, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deviceId, data.metric, data.value, data.threshold, data.message, data.severity || 'warning']
    );
  } catch (err) {
    logger.error('Failed to store alert:', err);
  }
  
  // Broadcast to WebSocket
  io?.to(`device:${deviceId}`).emit('alert', { 
    deviceId, 
    timestamp: Date.now(),
    ...data 
  });
  
  // Send push notification for critical alerts
  if (data.severity === 'critical' || data.severity === 'error') {
    try {
      await sendPushNotification({
        deviceId,
        title: `Alert: ${data.metric}`,
        message: data.message || `${data.metric} triggered an alert`,
        data: {
          deviceId,
          severity: data.severity,
          metric: data.metric,
          value: data.value
        }
      });
    } catch (err) {
      logger.error('Failed to send push notification:', err);
      // Don't fail the alert handling if push notification fails
    }
  }
}

async function handleStatusMessage(deviceId, data, app) {
  try {
    await db.query(
      `UPDATE devices SET last_seen = NOW(), is_online = true, firmware_version = $1 WHERE device_id = $2`,
      [data.firmware, deviceId]
    );
    
    const io = app.get('io');
    io?.to(`device:${deviceId}`).emit('status_update', { deviceId, ...data });
  } catch (err) {
    logger.error('Failed to process status message:', err);
  }
}

async function handleCommandAck(deviceId, data, app) {
  const io = app.get('io');
  io?.to(`device:${deviceId}`).emit('command_ack', { deviceId, ...data });
}

async function evaluateAlertRules(deviceId, data, app) {
  try {
    const rulesResult = await db.query(
      `SELECT * FROM alert_rules WHERE device_id = $1 AND is_active = true`,
      [deviceId]
    );
    
    for (const rule of rulesResult.rows) {
      const value = data[rule.metric];
      if (value === undefined) continue;
      
      let triggered = false;
      
      switch (rule.operator) {
        case 'gt':
          triggered = value > rule.threshold_value;
          break;
        case 'lt':
          triggered = value < rule.threshold_value;
          break;
        case 'eq':
          triggered = value === rule.threshold_value;
          break;
        case 'between':
          triggered = value < rule.threshold_min || value > rule.threshold_max;
          break;
      }
      
      if (triggered) {
        const message = `${rule.metric} is ${value} (threshold: ${rule.threshold_value || `${rule.threshold_min}-${rule.threshold_max}`})`;
        
        // Store alert
        await db.query(
          `INSERT INTO alert_history (rule_id, device_id, metric, value, threshold_value, message, severity)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [rule.id, deviceId, rule.metric, value, rule.threshold_value || rule.threshold_min, message, 'warning']
        );
        
        // Broadcast alert
        const io = app.get('io');
        io?.to(`device:${deviceId}`).emit('alert', {
          deviceId,
          ruleId: rule.id,
          metric: rule.metric,
          value,
          message,
          timestamp: Date.now()
        });
      }
    }
  } catch (err) {
    logger.error('Failed to evaluate alert rules:', err);
  }
}

function publish(topic, payload, options = {}) {
  if (!client?.connected) {
    logger.warn(`Cannot publish to ${topic}: MQTT not connected`);
    return false;
  }
  
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  client.publish(topic, message, { qos: 1, ...options });
  return true;
}

function sendCommand(deviceId, command, payload = {}) {
  const topic = `growos/${deviceId}/commands`;
  const message = {
    command,
    payload,
    timestamp: Date.now(),
    id: Math.random().toString(36).substring(7)
  };
  return publish(topic, message);
}

function isConnected() {
  return client?.connected || false;
}

function disconnect() {
  if (client) {
    client.end(true);
    client = null;
  }
}

/**
 * Send push notifications for alerts
 * Supports Firebase Cloud Messaging (FCM) if credentials are configured
 */
async function sendPushNotification(payload) {
  try {
    // Check if Firebase Admin SDK is available and configured
    const admin = require('firebase-admin');
    
    // Get user devices with FCM tokens
    const result = await db.query(
      `SELECT DISTINCT user_id FROM devices WHERE device_id = $1`,
      [payload.deviceId]
    );
    
    if (result.rows.length === 0) {
      logger.debug(`No device owner found for ${payload.deviceId}`);
      return;
    }
    
    const userId = result.rows[0].user_id;
    
    // Get FCM tokens for the user
    const tokensResult = await db.query(
      `CREATE TABLE IF NOT EXISTS fcm_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        device_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        last_used TIMESTAMP DEFAULT NOW()
      );
       SELECT token FROM fcm_tokens WHERE user_id = $1 AND token IS NOT NULL`,
      [userId]
    );
    
    const tokens = tokensResult.rows.map(r => r.token);
    
    if (tokens.length === 0) {
      logger.debug(`No FCM tokens registered for user ${userId}`);
      return;
    }
    
    // Send notification to all user tokens
    const message = {
      notification: {
        title: payload.title,
        body: payload.message
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default',
          icon: 'notification_icon'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.message
            },
            sound: 'default',
            badge: 1
          }
        }
      }
    };
    
    const sendResults = await admin.messaging().sendMulticast({
      ...message,
      tokens
    });
    
    logger.info(`Push notification sent to ${sendResults.successCount} devices, failed: ${sendResults.failureCount}`);
    
    // Handle failed tokens
    if (sendResults.failureCount > 0) {
      sendResults.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const token = tokens[idx];
          logger.warn(`Failed to send notification to token ${token}:`, resp.error);
          
          // Remove invalid tokens
          if (resp.error?.code === 'messaging/invalid-registration-token' ||
              resp.error?.code === 'messaging/registration-token-not-registered') {
            db.query('DELETE FROM fcm_tokens WHERE token = $1', [token]).catch(e => {
              logger.error('Failed to delete invalid FCM token:', e);
            });
          }
        }
      });
    }
  } catch (err) {
    // FCM not configured or Admin SDK not available - this is OK
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('not initialized')) {
      logger.debug('Firebase Admin SDK not configured for push notifications');
    } else {
      logger.warn('Could not send push notification:', err.message);
    }
  }
}

module.exports = {
  connect,
  disconnect,
  publish,
  sendCommand,
  isConnected,
  sendPushNotification
};
