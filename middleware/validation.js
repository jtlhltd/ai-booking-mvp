// Input Validation Middleware
// Provides comprehensive input validation using Joi schemas

import Joi from 'joi';

/**
 * Validation schemas for different endpoints
 */
export const validationSchemas = {
  // Client creation schema
  createClient: Joi.object({
    businessName: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Business name must be at least 2 characters',
        'string.max': 'Business name must not exceed 100 characters',
        'any.required': 'Business name is required'
      }),
    industry: Joi.string()
      .valid('healthcare', 'legal', 'beauty', 'fitness', 'consulting', 'other')
      .required()
      .messages({
        'any.only': 'Industry must be one of: healthcare, legal, beauty, fitness, consulting, other',
        'any.required': 'Industry is required'
      }),
    ownerEmail: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Owner email must be a valid email address',
        'any.required': 'Owner email is required'
      }),
    ownerPhone: Joi.string()
      .pattern(/^\+44\d{10}$/)
      .required()
      .messages({
        'string.pattern.base': 'Owner phone must be a valid UK phone number (+44XXXXXXXXXX)',
        'any.required': 'Owner phone is required'
      }),
    timezone: Joi.string()
      .default('Europe/London')
      .messages({
        'string.base': 'Timezone must be a string'
      }),
    locale: Joi.string()
      .default('en-GB')
      .messages({
        'string.base': 'Locale must be a string'
      })
  }),

  // Lead import schema
  importLeads: Joi.object({
    leads: Joi.array()
      .items(
        Joi.object({
          name: Joi.string()
            .min(1)
            .max(100)
            .required()
            .messages({
              'string.min': 'Lead name must be at least 1 character',
              'string.max': 'Lead name must not exceed 100 characters',
              'any.required': 'Lead name is required'
            }),
          phone: Joi.string()
            .pattern(/^\+44\d{10}$/)
            .required()
            .messages({
              'string.pattern.base': 'Phone must be a valid UK phone number (+44XXXXXXXXXX)',
              'any.required': 'Phone is required'
            }),
          email: Joi.string()
            .email()
            .optional()
            .messages({
              'string.email': 'Email must be a valid email address'
            }),
          service: Joi.string()
            .max(100)
            .optional()
            .messages({
              'string.max': 'Service must not exceed 100 characters'
            }),
          source: Joi.string()
            .max(50)
            .optional()
            .messages({
              'string.max': 'Source must not exceed 50 characters'
            }),
          notes: Joi.string()
            .max(500)
            .optional()
            .messages({
              'string.max': 'Notes must not exceed 500 characters'
            })
        })
      )
      .min(1)
      .max(1000)
      .required()
      .messages({
        'array.min': 'At least one lead is required',
        'array.max': 'Maximum 1000 leads allowed per import',
        'any.required': 'Leads array is required'
      })
  }),

  // SMS webhook schema
  smsWebhook: Joi.object({
    From: Joi.string()
      .pattern(/^\+44\d{10}$/)
      .required()
      .messages({
        'string.pattern.base': 'From phone must be a valid UK phone number',
        'any.required': 'From phone is required'
      }),
    To: Joi.string()
      .pattern(/^\+44\d{10}$/)
      .required()
      .messages({
        'string.pattern.base': 'To phone must be a valid UK phone number',
        'any.required': 'To phone is required'
      }),
    Body: Joi.string()
      .max(1600)
      .required()
      .messages({
        'string.max': 'SMS body must not exceed 1600 characters',
        'any.required': 'SMS body is required'
      }),
    MessageSid: Joi.string()
      .required()
      .messages({
        'any.required': 'MessageSid is required'
      }),
    MessagingServiceSid: Joi.string()
      .optional()
      .messages({
        'string.base': 'MessagingServiceSid must be a string'
      })
  }),

  // VAPI webhook schema
  vapiWebhook: Joi.object({
    call: Joi.object({
      id: Joi.string()
        .required()
        .messages({
          'any.required': 'Call ID is required'
        }),
      status: Joi.string()
        .valid('queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled')
        .required()
        .messages({
          'any.only': 'Call status must be a valid status',
          'any.required': 'Call status is required'
        }),
      outcome: Joi.string()
        .optional()
        .messages({
          'string.base': 'Call outcome must be a string'
        }),
      duration: Joi.number()
        .integer()
        .min(0)
        .optional()
        .messages({
          'number.base': 'Duration must be a number',
          'number.integer': 'Duration must be an integer',
          'number.min': 'Duration must be non-negative'
        }),
      cost: Joi.number()
        .min(0)
        .optional()
        .messages({
          'number.base': 'Cost must be a number',
          'number.min': 'Cost must be non-negative'
        }),
      transcript: Joi.string()
        .optional()
        .messages({
          'string.base': 'Transcript must be a string'
        }),
      recordingUrl: Joi.string()
        .uri()
        .optional()
        .messages({
          'string.uri': 'Recording URL must be a valid URI'
        })
    })
    .required()
    .messages({
      'any.required': 'Call object is required'
    }),
    lead: Joi.object({
      phoneNumber: Joi.string()
        .pattern(/^\+44\d{10}$/)
        .required()
        .messages({
          'string.pattern.base': 'Lead phone must be a valid UK phone number',
          'any.required': 'Lead phone is required'
        }),
      name: Joi.string()
        .max(100)
        .optional()
        .messages({
          'string.max': 'Lead name must not exceed 100 characters'
        })
    })
    .required()
    .messages({
      'any.required': 'Lead object is required'
    })
  }),

  // API key creation schema
  createApiKey: Joi.object({
    keyName: Joi.string()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.min': 'Key name must be at least 2 characters',
        'string.max': 'Key name must not exceed 50 characters',
        'any.required': 'Key name is required'
      }),
    permissions: Joi.array()
      .items(Joi.string())
      .default([])
      .messages({
        'array.base': 'Permissions must be an array'
      }),
    rateLimitPerMinute: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .default(100)
      .messages({
        'number.base': 'Rate limit per minute must be a number',
        'number.integer': 'Rate limit per minute must be an integer',
        'number.min': 'Rate limit per minute must be at least 1',
        'number.max': 'Rate limit per minute must not exceed 1000'
      }),
    rateLimitPerHour: Joi.number()
      .integer()
      .min(1)
      .max(10000)
      .default(1000)
      .messages({
        'number.base': 'Rate limit per hour must be a number',
        'number.integer': 'Rate limit per hour must be an integer',
        'number.min': 'Rate limit per hour must be at least 1',
        'number.max': 'Rate limit per hour must not exceed 10000'
      }),
    expiresAt: Joi.date()
      .greater('now')
      .optional()
      .messages({
        'date.base': 'Expiration date must be a valid date',
        'date.greater': 'Expiration date must be in the future'
      })
  }),

  // Query parameters schema
  queryParams: Joi.object({
    limit: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .default(100)
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit must not exceed 1000'
      }),
    offset: Joi.number()
      .integer()
      .min(0)
      .default(0)
      .messages({
        'number.base': 'Offset must be a number',
        'number.integer': 'Offset must be an integer',
        'number.min': 'Offset must be non-negative'
      }),
    sortBy: Joi.string()
      .valid('created_at', 'updated_at', 'name', 'phone', 'status')
      .default('created_at')
      .messages({
        'any.only': 'Sort by must be one of: created_at, updated_at, name, phone, status'
      }),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .messages({
        'any.only': 'Sort order must be either asc or desc'
      }),
    status: Joi.string()
      .valid('new', 'contacted', 'interested', 'not_interested', 'booked', 'completed')
      .optional()
      .messages({
        'any.only': 'Status must be a valid lead status'
      }),
    dateFrom: Joi.date()
      .optional()
      .messages({
        'date.base': 'Date from must be a valid date'
      }),
    dateTo: Joi.date()
      .greater(Joi.ref('dateFrom'))
      .optional()
      .messages({
        'date.base': 'Date to must be a valid date',
        'date.greater': 'Date to must be after date from'
      })
  })
};

/**
 * Validation middleware factory
 */
export function validateRequest(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = source === 'body' ? req.body : 
                   source === 'query' ? req.query : 
                   source === 'params' ? req.params : 
                   req[source];

      const { error, value } = schema.validate(data, {
        abortEarly: false, // Return all validation errors
        stripUnknown: true, // Remove unknown fields
        convert: true // Convert types when possible
      });

      if (error) {
        const { ValidationError } = require('../lib/errors.js');
        
        // Format validation errors
        const details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        const validationError = new ValidationError('Validation failed', null, null, details);
        return next(validationError);
      }

      // Replace the original data with validated data
      if (source === 'body') req.body = value;
      else if (source === 'query') req.query = value;
      else if (source === 'params') req.params = value;
      else req[source] = value;

      next();
    } catch (validationError) {
      console.error('[VALIDATION MIDDLEWARE ERROR]', validationError);
      next(validationError);
    }
  };
}

/**
 * Sanitization middleware
 */
export function sanitizeInput(req, res, next) {
  try {
    const sanitizeObject = (obj) => {
      if (typeof obj === 'string') {
        // Remove script tags and dangerous content
        return obj
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      }
      
      if (typeof obj === 'object' && obj !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      
      return obj;
    };

    // Sanitize all input sources
    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    req.params = sanitizeObject(req.params);

    next();
  } catch (sanitizationError) {
    console.error('[SANITIZATION ERROR]', sanitizationError);
    next(sanitizationError);
  }
}

/**
 * Rate limiting per endpoint
 */
export function createEndpointRateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    keyGenerator = (req) => `${req.ip}:${req.path}`,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (v.timestamp < windowStart) {
        requests.delete(k);
      }
    }

    // Get or create request record
    let record = requests.get(key);
    if (!record) {
      record = { count: 0, timestamp: now };
      requests.set(key, record);
    }

    // Reset counter if window has passed
    if (record.timestamp < windowStart) {
      record.count = 0;
      record.timestamp = now;
    }

    // Check rate limit
    if (record.count >= max) {
      const { RateLimitError } = require('../lib/errors.js');
      const retryAfter = Math.ceil((record.timestamp + windowMs - now) / 1000);
      return next(new RateLimitError(`Rate limit exceeded for ${req.path}`, retryAfter));
    }

    // Increment counter
    record.count++;

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': max.toString(),
      'X-RateLimit-Remaining': Math.max(0, max - record.count).toString(),
      'X-RateLimit-Reset': new Date(record.timestamp + windowMs).toISOString()
    });

    next();
  };
}

export default {
  validationSchemas,
  validateRequest,
  sanitizeInput,
  createEndpointRateLimit
};




























