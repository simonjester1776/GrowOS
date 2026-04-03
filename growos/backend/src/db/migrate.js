const { pool } = require('./pool');
const logger = require('../utils/logger');

const migrations = [
  // Users table
  `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
  );
  `,
  
  // Devices table (Guardians and Buddies)
  `
  CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) UNIQUE NOT NULL,
    device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('guardian', 'buddy')),
    name VARCHAR(100),
    location VARCHAR(255),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    firmware_version VARCHAR(20),
    last_seen TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    battery_voltage FLOAT,
    rssi INTEGER,
    snr FLOAT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  `,
  
  // Device relationships (Buddy -> Guardian)
  `
  CREATE TABLE IF NOT EXISTS device_relationships (
    id SERIAL PRIMARY KEY,
    guardian_id VARCHAR(32) REFERENCES devices(device_id) ON DELETE CASCADE,
    buddy_id VARCHAR(32) REFERENCES devices(device_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(guardian_id, buddy_id)
  );
  `,
  
  // Sensor readings (TimescaleDB hypertable)
  `
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL,
    device_id VARCHAR(32) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    ts TIMESTAMP NOT NULL,
    co2 INTEGER,
    temperature FLOAT,
    humidity FLOAT,
    pressure FLOAT,
    lux INTEGER,
    voc_index INTEGER,
    vpd FLOAT,
    moisture FLOAT,
    soil_temp FLOAT,
    ec FLOAT,
    ph FLOAT,
    pm25 FLOAT,
    pm10 FLOAT,
    battery_voltage FLOAT,
    metadata JSONB DEFAULT '{}'
  );
  `,
  
  // Convert to hypertable if TimescaleDB is available
  `
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
      PERFORM create_hypertable('sensor_readings', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB not available, using regular table';
  END $$;
  `,
  
  // Indexes for sensor readings
  `
  CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_ts 
    ON sensor_readings (device_id, ts DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_sensor_readings_ts 
    ON sensor_readings (ts DESC);
  `,
  
  // Alerts configuration
  `
  CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    metric VARCHAR(50) NOT NULL,
    operator VARCHAR(10) NOT NULL CHECK (operator IN ('gt', 'lt', 'eq', 'between')),
    threshold_min FLOAT,
    threshold_max FLOAT,
    threshold_value FLOAT,
    duration_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notify_push BOOLEAN DEFAULT true,
    notify_email BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  `,
  
  // Alert history
  `
  CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER REFERENCES alert_rules(id) ON DELETE SET NULL,
    device_id VARCHAR(32) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,
    value FLOAT NOT NULL,
    threshold_value FLOAT,
    message TEXT,
    severity VARCHAR(20) DEFAULT 'warning',
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
  `,
  
  // Relay states and history
  `
  CREATE TABLE IF NOT EXISTS relay_states (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    relay_index INTEGER NOT NULL,
    relay_name VARCHAR(50),
    is_on BOOLEAN DEFAULT false,
    auto_mode BOOLEAN DEFAULT false,
    schedule JSONB DEFAULT '[]',
    last_toggled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(device_id, relay_index)
  );
  `,
  
  `
  CREATE TABLE IF NOT EXISTS relay_history (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    relay_index INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,
    triggered_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  );
  `,
  
  // API keys for device authentication
  `
  CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    api_key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );
  `,
  
  // User sessions
  `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
  `
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    logger.info('Running database migrations...');
    
    for (let i = 0; i < migrations.length; i++) {
      try {
        await client.query(migrations[i]);
        logger.info(`Migration ${i + 1}/${migrations.length} completed`);
      } catch (error) {
        logger.error(`Migration ${i + 1} failed:`, error.message);
        // Continue with other migrations
      }
    }
    
    logger.info('Database migrations completed');
  } catch (error) {
    logger.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
