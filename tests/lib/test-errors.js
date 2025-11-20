// tests/lib/test-errors.js
// Test error classes and utilities

import { 
  AppError, ValidationError, AuthenticationError, AuthorizationError, 
  NotFoundError, ConflictError, RateLimitError, ExternalServiceError,
  DatabaseError, BusinessLogicError, ConfigurationError, ErrorFactory,
  formatErrorResponse, asyncHandler, logError
} from '../../lib/errors.js';
import { describe, test, assertTrue, assertEqual, assertThrows, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Error Classes Tests', () => {
  
  test('AppError base class', () => {
    const error = new AppError('Test error', 500);
    assertTrue(error instanceof Error, 'AppError is Error instance');
    assertEqual(error.message, 'Test error', 'Error message set');
    assertEqual(error.statusCode, 500, 'Status code set');
  });
  
  test('ValidationError', () => {
    const error = new ValidationError('Invalid input', 'email', 'invalid-email');
    assertTrue(error instanceof ValidationError, 'ValidationError instance');
    assertTrue(error instanceof AppError, 'ValidationError extends AppError');
    assertEqual(error.statusCode, 400, 'ValidationError has 400 status');
    assertEqual(error.field, 'email', 'Field set');
  });
  
  test('AuthenticationError', () => {
    const error = new AuthenticationError('Unauthorized');
    assertTrue(error instanceof AuthenticationError, 'AuthenticationError instance');
    assertEqual(error.statusCode, 401, 'AuthenticationError has 401 status');
  });
  
  test('AuthorizationError', () => {
    const error = new AuthorizationError('Forbidden');
    assertTrue(error instanceof AuthorizationError, 'AuthorizationError instance');
    assertEqual(error.statusCode, 403, 'AuthorizationError has 403 status');
  });
  
  test('NotFoundError', () => {
    const error = new NotFoundError('Resource');
    assertTrue(error instanceof NotFoundError, 'NotFoundError instance');
    assertEqual(error.statusCode, 404, 'NotFoundError has 404 status');
  });
  
  test('ConflictError', () => {
    const error = new ConflictError('Resource exists');
    assertTrue(error instanceof ConflictError, 'ConflictError instance');
    assertEqual(error.statusCode, 409, 'ConflictError has 409 status');
  });
  
  test('RateLimitError', () => {
    const error = new RateLimitError('Too many requests');
    assertTrue(error instanceof RateLimitError, 'RateLimitError instance');
    assertEqual(error.statusCode, 429, 'RateLimitError has 429 status');
  });
  
  test('ExternalServiceError', () => {
    const error = new ExternalServiceError('vapi', 'Service unavailable');
    assertTrue(error instanceof ExternalServiceError, 'ExternalServiceError instance');
    assertEqual(error.service, 'vapi', 'Service name set');
  });
  
  test('DatabaseError', () => {
    const error = new DatabaseError('Database connection failed');
    assertTrue(error instanceof DatabaseError, 'DatabaseError instance');
    assertEqual(error.statusCode, 500, 'DatabaseError has 500 status');
  });
  
  test('BusinessLogicError', () => {
    const error = new BusinessLogicError('Invalid business rule');
    assertTrue(error instanceof BusinessLogicError, 'BusinessLogicError instance');
  });
  
  test('ConfigurationError', () => {
    const error = new ConfigurationError('Missing configuration');
    assertTrue(error instanceof ConfigurationError, 'ConfigurationError instance');
  });
  
  test('ErrorFactory', () => {
    const error = ErrorFactory.validation('Invalid input', 'email', 'test');
    assertTrue(error instanceof ValidationError, 'ErrorFactory creates ValidationError');
  });
  
  test('formatErrorResponse', () => {
    const error = new ValidationError('Test', 'field', 'value');
    const response = formatErrorResponse(error);
    assertTrue(typeof response === 'object', 'Response is object');
    assertTrue('error' in response, 'Response has error field');
  });
  
  test('asyncHandler', async () => {
    const handler = asyncHandler(async (req, res) => {
      return { success: true };
    });
    
    assertTrue(typeof handler === 'function', 'asyncHandler returns function');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

