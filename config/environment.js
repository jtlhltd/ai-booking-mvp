// Safe extraction - Configuration and constants
// These have minimal dependencies and can be moved safely

// Extract from server.js to config/environment.js
export const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    type: process.env.DB_TYPE || 'sqlite',
    path: process.env.DB_PATH || 'data/app.db'
  },
  
  // External service configuration
  services: {
    vapi: {
      apiKey: process.env.VAPI_API_KEY,
      webhookUrl: process.env.VAPI_WEBHOOK_URL
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    google: {
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY,
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
    },
    email: {
      service: process.env.EMAIL_SERVICE,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  },
  
  // Security configuration
  security: {
    apiKeyHeader: 'X-API-Key',
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: 100,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
  },
  
  // Business configuration
  business: {
    defaultTimezone: 'Europe/London',
    defaultLocale: 'en-GB',
    businessHours: {
      start: '09:00',
      end: '17:00',
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    callSettings: {
      defaultDuration: 30, // minutes
      maxRetries: 3,
      retryDelay: 60000 // 1 minute
    }
  }
};

// Validation function
export function validateConfig() {
  const required = [
    'VAPI_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing required environment variables:', missing.join(', '));
    console.warn('   Some features may not work correctly');
  }
  
  return missing.length === 0;
}

// Default API responses
export const defaultResponses = {
  success: (data, message = 'Success') => ({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  }),
  
  error: (message, code = 'ERROR', statusCode = 500) => ({
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString()
    }
  }),
  
  validation: (details) => ({
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details,
      timestamp: new Date().toISOString()
    }
  })
};

// Common constants
export const constants = {
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500
  },
  
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT_ERROR: 'CONFLICT_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  },
  
  LEAD_STATUS: {
    NEW: 'new',
    CONTACTED: 'contacted',
    INTERESTED: 'interested',
    NOT_INTERESTED: 'not_interested',
    BOOKED: 'booked',
    COMPLETED: 'completed'
  },
  
  CALL_STATUS: {
    QUEUED: 'queued',
    RINGING: 'ringing',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    BUSY: 'busy',
    NO_ANSWER: 'no-answer',
    FAILED: 'failed',
    CANCELED: 'canceled'
  }
};

