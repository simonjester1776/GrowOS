const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

async function connect() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('Database connection verified');
  } finally {
    client.release();
  }
}

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 50)}...`);
    return result;
  } catch (error) {
    logger.error('Query error:', { error: error.message, query: text });
    throw error;
  }
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  connect,
  query,
  transaction
};
