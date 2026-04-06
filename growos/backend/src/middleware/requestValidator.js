const { validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');
const logger = require('../utils/logger');

// Sanitize input strings
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent XSS
    .substring(0, 1000); // Limit length
};

// Sanitize object recursively
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key too
    const sanitizedKey = sanitizeString(key);
    sanitized[sanitizedKey] = sanitizeObject(value);
  }
  return sanitized;
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const details = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    
    logger.warn('Validation failed:', {
      requestId: req.id,
      path: req.path,
      errors: details
    });

    throw new ValidationError('Validation failed', details);
  }
  
  next();
};

// Device ID validation
const validateDeviceId = (deviceId) => {
  if (!deviceId || typeof deviceId !== 'string') {
    return false;
  }
  // Allow alphanumeric, hyphens, and underscores, 3-32 characters
  return /^[a-zA-Z0-9_-]{3,32}$/.test(deviceId);
};

// Email validation
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

// Password strength validation
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' };
  }
  
  // Check for at least one uppercase, one lowercase, one number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return { 
      valid: false, 
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
    };
  }
  
  return { valid: true };
};

// Metric name validation
const VALID_METRICS = [
  'co2', 'temperature', 'humidity', 'pressure', 'lux', 
  'voc', 'vpd', 'moisture', 'soil_temp', 'ec', 'ph'
];

const validateMetric = (metric) => {
  return VALID_METRICS.includes(metric);
};

// Time range validation
const validateTimeRange = (hours, days) => {
  const value = hours || (days * 24);
  return value >= 1 && value <= 720; // Max 30 days
};

// Pagination validation
const validatePagination = (page, limit) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 50;
  
  return {
    page: Math.max(1, pageNum),
    limit: Math.min(100, Math.max(1, limitNum)),
    offset: (pageNum - 1) * limitNum
  };
};

// JSON parsing middleware with error handling
const safeJsonParse = (req, res, next) => {
  const originalJson = req.json;
  
  req.json = function() {
    try {
      return originalJson.call(this);
    } catch (err) {
      logger.warn('JSON parse error:', err.message);
      throw new ValidationError('Invalid JSON in request body');
    }
  };
  
  next();
};

module.exports = {
  sanitizeRequest,
  handleValidationErrors,
  validateDeviceId,
  validateEmail,
  validatePassword,
  validateMetric,
  validateTimeRange,
  validatePagination,
  safeJsonParse,
  VALID_METRICS
};
