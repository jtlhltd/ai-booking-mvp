// Centralized Error Handling System
// Provides consistent error responses and proper error classification

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
    this.details = field ? { field, value, message } : { message };
  }
}

/**
 * Authentication error for auth failures
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error for permission failures
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

/**
 * Conflict error for duplicate resources
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

/**
 * Rate limit error for too many requests
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error for third-party API failures
 */
export class ExternalServiceError extends AppError {
  constructor(service, message, originalError = null) {
    super(`External service error: ${service} - ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError;
    this.isOperational = false; // External errors are not operational
  }
}

/**
 * Database error for database operation failures
 */
export class DatabaseError extends AppError {
  constructor(operation, message, originalError = null) {
    super(`Database error during ${operation}: ${message}`, 500, 'DATABASE_ERROR');
    this.operation = operation;
    this.originalError = originalError;
    this.isOperational = false;
  }
}

/**
 * Business logic error for domain-specific failures
 */
export class BusinessLogicError extends AppError {
  constructor(message, context = {}) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
    this.context = context;
  }
}

/**
 * Configuration error for missing or invalid configuration
 */
export class ConfigurationError extends AppError {
  constructor(configKey, message) {
    super(`Configuration error: ${configKey} - ${message}`, 500, 'CONFIGURATION_ERROR');
    this.configKey = configKey;
    this.isOperational = false;
  }
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  static fromDatabaseError(error, operation) {
    if (error.code === '23505') { // Unique constraint violation
      return new ConflictError('Resource already exists');
    }
    if (error.code === '23503') { // Foreign key constraint violation
      return new ValidationError('Referenced resource does not exist');
    }
    if (error.code === '23502') { // Not null constraint violation
      return new ValidationError('Required field is missing');
    }
    return new DatabaseError(operation, error.message, error);
  }

  static fromExternalServiceError(error, service) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new ExternalServiceError(service, 'Service unavailable', error);
    }
    if (error.status === 401) {
      return new AuthenticationError(`Invalid credentials for ${service}`);
    }
    if (error.status === 403) {
      return new AuthorizationError(`Access denied for ${service}`);
    }
    if (error.status === 429) {
      return new RateLimitError(`Rate limit exceeded for ${service}`);
    }
    return new ExternalServiceError(service, error.message, error);
  }

  static fromValidationError(error) {
    if (error.details) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      return new ValidationError('Validation failed', null, null, details);
    }
    return new ValidationError(error.message);
  }
}

/**
 * Error response formatter
 */
export function formatErrorResponse(error, req = null) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const response = {
    error: {
      message: error.message,
      code: error.code,
      timestamp: error.timestamp || new Date().toISOString(),
      statusCode: error.statusCode
    }
  };

  // Add additional details in development
  if (isDevelopment) {
    response.error.stack = error.stack;
    response.error.name = error.name;
    if (error.field) response.error.field = error.field;
    if (error.service) response.error.service = error.service;
    if (error.operation) response.error.operation = error.operation;
    if (error.context) response.error.context = error.context;
  }

  // Add request context for debugging
  if (req && isDevelopment) {
    response.error.request = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    };
  }

  // Add retry information for rate limits
  if (error instanceof RateLimitError) {
    response.error.retryAfter = error.retryAfter;
    response.error.retryAfterSeconds = error.retryAfter;
  }

  return response;
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error logging utility
 */
export function logError(error, req = null, additionalContext = {}) {
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      timestamp: new Date().toISOString()
    },
    context: {
      ...additionalContext,
      ...(req && {
        request: {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          clientKey: req.clientKey,
          apiKeyId: req.apiKey?.id
        }
      })
    }
  };

  // Log based on error severity
  if (error.statusCode >= 500) {
    console.error('[ERROR]', JSON.stringify(logData, null, 2));
  } else if (error.statusCode >= 400) {
    console.warn('[WARN]', JSON.stringify(logData, null, 2));
  } else {
    console.info('[INFO]', JSON.stringify(logData, null, 2));
  }

  return logData;
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  BusinessLogicError,
  ConfigurationError,
  ErrorFactory,
  formatErrorResponse,
  asyncHandler,
  logError
};

