const redis = require('redis');
const logger = require('../utils/logger');

let client = null;
let isConnected = false;

async function connect() {
  if (!process.env.REDIS_URL) {
    logger.info('Redis URL not configured, skipping Redis connection');
    return null;
  }

  client = redis.createClient({
    url: process.env.REDIS_URL,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        logger.error('Redis server connection refused');
        return new Error('Redis server connection refused');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        logger.error('Redis retry time exhausted');
        return new Error('Retry time exhausted');
      }
      if (options.attempt > 10) {
        logger.error('Redis max retry attempts reached');
        return undefined;
      }
      return Math.min(options.attempt * 100, 3000);
    }
  });

  client.on('error', (err) => {
    logger.error('Redis error:', err.message);
    isConnected = false;
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
    isConnected = true;
  });

  client.on('disconnect', () => {
    logger.warn('Redis client disconnected');
    isConnected = false;
  });

  await client.connect();
  return client;
}

async function health() {
  if (!client) {
    return { status: 'disabled' };
  }
  
  try {
    await client.ping();
    return { status: 'ok', connected: isConnected };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// Cache operations with TTL
async function get(key) {
  if (!client || !isConnected) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.error('Redis get error:', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds = 300) {
  if (!client || !isConnected) return false;
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.error('Redis set error:', err.message);
    return false;
  }
}

async function del(key) {
  if (!client || !isConnected) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.error('Redis del error:', err.message);
    return false;
  }
}

async function delPattern(pattern) {
  if (!client || !isConnected) return false;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return true;
  } catch (err) {
    logger.error('Redis delPattern error:', err.message);
    return false;
  }
}

// Cache wrapper for async functions
function cacheWrapper(fn, keyGenerator, ttlSeconds = 300) {
  return async (...args) => {
    const cacheKey = keyGenerator(...args);
    
    // Try to get from cache
    const cached = await get(cacheKey);
    if (cached !== null) {
      logger.debug(`Cache hit for key: ${cacheKey}`);
      return cached;
    }
    
    // Execute function
    const result = await fn(...args);
    
    // Store in cache
    await set(cacheKey, result, ttlSeconds);
    
    return result;
  };
}

// Invalidate cache for device
async function invalidateDeviceCache(deviceId) {
  await delPattern(`device:${deviceId}:*`);
  await delPattern(`sensors:${deviceId}:*`);
}

// Invalidate cache for user
async function invalidateUserCache(userId) {
  await delPattern(`user:${userId}:*`);
}

module.exports = {
  connect,
  health,
  get,
  set,
  del,
  delPattern,
  cacheWrapper,
  invalidateDeviceCache,
  invalidateUserCache,
  get client() { return client; },
  get isConnected() { return isConnected; }
};
