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
  
  // TODO: Send push notification via FCM
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

module.exports = {
  connect,
  disconnect,
  publish,
  sendCommand,
  isConnected
};
