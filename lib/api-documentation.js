// lib/api-documentation.js
// API documentation generator (OpenAPI/Swagger compatible)

export function generateApiDocs() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'AI Booking MVP API',
      version: '1.0.0',
      description: 'API for AI-powered booking and lead management system',
      contact: {
        email: process.env.YOUR_EMAIL || 'support@example.com'
      }
    },
    servers: [
      {
        url: process.env.PUBLIC_BASE_URL || 'https://ai-booking-mvp.onrender.com',
        description: 'Production server'
      }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check endpoint',
          description: 'Returns basic health status of the server',
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/health/detailed': {
        get: {
          summary: 'Detailed health check',
          description: 'Returns comprehensive health status of all services',
          responses: {
            '200': {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      services: {
                        type: 'object',
                        properties: {
                          database: { type: 'object' },
                          twilio: { type: 'object' },
                          vapi: { type: 'object' },
                          googleCalendar: { type: 'object' },
                          email: { type: 'object' },
                          backup: { type: 'object' }
                        }
                      },
                      overall: { type: 'string', enum: ['healthy', 'degraded'] }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/backup-status': {
        get: {
          summary: 'Backup system status',
          description: 'Check the status of the backup verification system',
          responses: {
            '200': {
              description: 'Backup status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      status: { type: 'string', enum: ['healthy', 'warning', 'error'] },
                      message: { type: 'string' },
                      details: {
                        type: 'object',
                        properties: {
                          databaseAccessible: { type: 'boolean' },
                          recentActivity: { type: 'boolean' },
                          hoursSinceActivity: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/cost-summary/{clientKey}': {
        get: {
          summary: 'Get cost summary for a client',
          description: 'Returns cost breakdown by type for a specific client',
          parameters: [
            {
              name: 'clientKey',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Client identifier'
            },
            {
              name: 'period',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
              description: 'Time period for cost summary'
            }
          ],
          responses: {
            '200': {
              description: 'Cost summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      clientKey: { type: 'string' },
                      period: { type: 'string' },
                      total: { type: 'number' },
                      breakdown: { type: 'array' },
                      summary: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/webhook-retry-stats': {
        get: {
          summary: 'Webhook retry statistics',
          description: 'Get statistics about webhook retry attempts',
          parameters: [
            {
              name: 'clientKey',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by client key (optional)'
            }
          ],
          responses: {
            '200': {
              description: 'Retry statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      stats: { type: 'array' },
                      summary: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/sms-delivery-rate/{clientKey}': {
        get: {
          summary: 'SMS delivery rate',
          description: 'Get SMS delivery statistics for a client',
          parameters: [
            {
              name: 'clientKey',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'days',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 7 },
              description: 'Number of days to analyze'
            }
          ],
          responses: {
            '200': {
              description: 'SMS delivery statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      clientKey: { type: 'string' },
                      days: { type: 'integer' },
                      totalSent: { type: 'integer' },
                      totalDelivered: { type: 'integer' },
                      deliveryRate: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/calendar-sync/{clientKey}': {
        get: {
          summary: 'Calendar sync status',
          description: 'Check Google Calendar sync status for a client',
          parameters: [
            {
              name: 'clientKey',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Calendar sync status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      connected: { type: 'boolean' },
                      recentAppointments: { type: 'integer' },
                      conflicts: { type: 'integer' },
                      lastSync: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/recordings/quality-check/{clientKey}': {
        get: {
          summary: 'Check call recording quality',
          description: 'Verify accessibility of recent call recordings',
          parameters: [
            {
              name: 'clientKey',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 10 },
              description: 'Number of recordings to check'
            }
          ],
          responses: {
            '200': {
              description: 'Recording quality check results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      total: { type: 'integer' },
                      broken: { type: 'integer' },
                      checks: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/dashboard/reset/{clientKey}': {
        post: {
          summary: 'Reset client dashboard data',
          description: 'Clear appointments, calls, messages, and optionally leads for a client',
          parameters: [
            {
              name: 'clientKey',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    includeLeads: {
                      type: 'boolean',
                      description: 'Whether to also delete leads',
                      default: false
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Dashboard reset successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      cleared: {
                        type: 'object',
                        properties: {
                          appointments: { type: 'boolean' },
                          calls: { type: 'boolean' },
                          messages: { type: 'boolean' },
                          leads: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/calendar/check-book': {
        post: {
          summary: 'Check availability and book appointment',
          description: 'Check calendar availability and create a booking',
          security: [
            {
              ApiKeyAuth: []
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['start', 'end'],
                  properties: {
                    start: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Appointment start time'
                    },
                    end: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Appointment end time'
                    },
                    lead: {
                      type: 'object',
                      properties: {
                        phone: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Booking successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      appointment: { type: 'object' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request (invalid time slot, conflict, etc.)'
            },
            '401': {
              description: 'Unauthorized (missing or invalid API key)'
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication'
        }
      }
    },
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Monitoring', description: 'System monitoring and statistics' },
      { name: 'Bookings', description: 'Appointment booking endpoints' },
      { name: 'Dashboard', description: 'Client dashboard management' }
    ]
  };
}

export default {
  generateApiDocs
};

