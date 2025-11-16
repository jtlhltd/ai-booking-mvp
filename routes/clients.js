// Example Route with Comprehensive Error Handling
// Demonstrates proper error handling patterns for API endpoints

import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { validateRequest, validationSchemas } from '../middleware/validation.js';
import { authenticateApiKey, requireTenantAccess } from '../middleware/security.js';
import { NotFoundError, ValidationError, ConflictError, BusinessLogicError } from '../lib/errors.js';
import { getRetryManager, getCircuitBreaker } from '../lib/retry-logic.js';
import { safeQuery, getFullClient, upsertFullClient } from '../db.js';

const router = Router();

// Apply authentication and validation middleware
router.use(authenticateApiKey);
router.use(validateRequest(validationSchemas.queryParams, 'query'));

/**
 * GET /api/clients - List all clients with error handling
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { limit, offset, sortBy, sortOrder, status } = req.query;
    
    // Build dynamic query with error handling
    let query = `
      SELECT client_key, display_name, timezone, locale, is_enabled, created_at
      FROM tenants 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Add status filter if provided
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    // Add sorting
    const validSortFields = ['created_at', 'display_name', 'client_key'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${sortDirection}`;

    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    // Execute query with retry logic
    const retryManager = getRetryManager();
    const result = await retryManager.execute(
      () => safeQuery(query, params),
      { operation: 'list_clients', limit, offset }
    );

    // Get total count for pagination
    const countResult = await safeQuery('SELECT COUNT(*) as total FROM tenants');
    const total = parseInt(countResult.rows[0]?.total || 0);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    // Error will be handled by the error handler middleware
    throw error;
  }
}));

/**
 * GET /api/clients/:clientKey - Get specific client
 */
router.get('/:clientKey', asyncHandler(async (req, res) => {
  const { clientKey } = req.params;

  // Validate client key format
  if (!clientKey || clientKey.length < 2) {
    throw new ValidationError('Client key must be at least 2 characters', 'clientKey', clientKey);
  }

  // Get client with circuit breaker protection
  const circuitBreaker = getCircuitBreaker('database', {
    failureThreshold: 3,
    resetTimeout: 30000
  });

  const client = await circuitBreaker.execute(
    () => getFullClient(clientKey),
    { operation: 'get_client', clientKey }
  );

  if (!client) {
    throw new NotFoundError('Client');
  }

  res.json({
    success: true,
    data: client
  });
}));

/**
 * POST /api/clients - Create new client
 */
router.post('/', 
  validateRequest(validationSchemas.createClient, 'body'),
  asyncHandler(async (req, res) => {
    const clientData = req.body;

    // Check if client already exists
    const existingClient = await getFullClient(clientData.businessName.toLowerCase().replace(/\s+/g, '_'));
    if (existingClient) {
      throw new ConflictError(`Client with business name "${clientData.businessName}" already exists`);
    }

    // Validate business hours if provided
    if (clientData.businessHours) {
      const { BusinessLogicError } = await import('../lib/errors.js');
      
      if (!clientData.businessHours.start || !clientData.businessHours.end) {
        throw new BusinessLogicError('Business hours must include start and end times', {
          field: 'businessHours',
          provided: clientData.businessHours
        });
      }

      const startHour = parseInt(clientData.businessHours.start.split(':')[0]);
      const endHour = parseInt(clientData.businessHours.end.split(':')[0]);
      
      if (startHour >= endHour) {
        throw new BusinessLogicError('Business start time must be before end time', {
          startHour,
          endHour
        });
      }
    }

    // Create client with retry logic
    const retryManager = getRetryManager({
      maxRetries: 2,
      baseDelay: 500
    });

    const newClient = await retryManager.execute(
      async () => {
        const clientKey = clientData.businessName.toLowerCase().replace(/\s+/g, '_');
        
        const client = {
          clientKey,
          displayName: clientData.businessName,
          timezone: clientData.timezone || 'Europe/London',
          locale: clientData.locale || 'en-GB',
          booking: {
            timezone: clientData.timezone || 'Europe/London',
            defaultDurationMin: 30,
            businessHours: clientData.businessHours || {
              start: '09:00',
              end: '17:00',
              days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            }
          }
        };

        await upsertFullClient(client);
        return client;
      },
      { operation: 'create_client', businessName: clientData.businessName }
    );

    res.status(201).json({
      success: true,
      data: newClient,
      message: 'Client created successfully'
    });
  })
);

/**
 * PUT /api/clients/:clientKey - Update client
 */
router.put('/:clientKey',
  requireTenantAccess,
  validateRequest(validationSchemas.createClient, 'body'),
  asyncHandler(async (req, res) => {
    const { clientKey } = req.params;
    const updateData = req.body;

    // Check if client exists
    const existingClient = await getFullClient(clientKey);
    if (!existingClient) {
      throw new NotFoundError('Client');
    }

    // Validate tenant access
    if (req.clientKey !== clientKey) {
      throw new ValidationError('Cannot update client from different tenant', 'clientKey', clientKey);
    }

    // Update client
    const updatedClient = {
      ...existingClient,
      ...updateData,
      clientKey // Ensure clientKey doesn't change
    };

    await upsertFullClient(updatedClient);

    res.json({
      success: true,
      data: updatedClient,
      message: 'Client updated successfully'
    });
  })
);

/**
 * DELETE /api/clients/:clientKey - Delete client
 */
router.delete('/:clientKey',
  requireTenantAccess,
  asyncHandler(async (req, res) => {
    const { clientKey } = req.params;

    // Validate tenant access
    if (req.clientKey !== clientKey) {
      throw new ValidationError('Cannot delete client from different tenant', 'clientKey', clientKey);
    }

    // Check if client exists
    const existingClient = await getFullClient(clientKey);
    if (!existingClient) {
      throw new NotFoundError('Client');
    }

    // Check for dependent data
    const dependentData = await safeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE client_key = $1) as lead_count,
        (SELECT COUNT(*) FROM calls WHERE client_key = $1) as call_count,
        (SELECT COUNT(*) FROM appointments WHERE client_key = $1) as appointment_count
    `, [clientKey]);

    const counts = dependentData.rows[0];
    if (counts.lead_count > 0 || counts.call_count > 0 || counts.appointment_count > 0) {
      throw new BusinessLogicError('Cannot delete client with existing data', {
        leadCount: parseInt(counts.lead_count),
        callCount: parseInt(counts.call_count),
        appointmentCount: parseInt(counts.appointment_count),
        suggestion: 'Archive the client instead of deleting'
      });
    }

    // Delete client
    await safeQuery('DELETE FROM tenants WHERE client_key = $1', [clientKey]);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  })
);

/**
 * GET /api/clients/:clientKey/stats - Get client statistics
 */
router.get('/:clientKey/stats',
  requireTenantAccess,
  asyncHandler(async (req, res) => {
    const { clientKey } = req.params;

    // Validate tenant access
    if (req.clientKey !== clientKey) {
      throw new ValidationError('Cannot access stats for different tenant', 'clientKey', clientKey);
    }

    // Get comprehensive stats with error handling
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE client_key = $1) as total_leads,
        (SELECT COUNT(*) FROM leads WHERE client_key = $1 AND status = 'new') as new_leads,
        (SELECT COUNT(*) FROM leads WHERE client_key = $1 AND status = 'booked') as booked_leads,
        (SELECT COUNT(*) FROM calls WHERE client_key = $1) as total_calls,
        (SELECT COUNT(*) FROM calls WHERE client_key = $1 AND outcome = 'booked') as successful_calls,
        (SELECT AVG(quality_score) FROM calls WHERE client_key = $1 AND quality_score IS NOT NULL) as avg_quality_score,
        (SELECT SUM(cost) FROM calls WHERE client_key = $1) as total_cost,
        (SELECT COUNT(*) FROM appointments WHERE client_key = $1) as total_appointments
    `;

    const result = await safeQuery(statsQuery, [clientKey]);
    const stats = result.rows[0];

    // Calculate conversion rate
    const conversionRate = stats.total_calls > 0 
      ? (stats.successful_calls / stats.total_calls * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        leads: {
          total: parseInt(stats.total_leads || 0),
          new: parseInt(stats.new_leads || 0),
          booked: parseInt(stats.booked_leads || 0)
        },
        calls: {
          total: parseInt(stats.total_calls || 0),
          successful: parseInt(stats.successful_calls || 0),
          conversionRate: parseFloat(conversionRate),
          avgQualityScore: parseFloat(stats.avg_quality_score || 0)
        },
        appointments: {
          total: parseInt(stats.total_appointments || 0)
        },
        costs: {
          total: parseFloat(stats.total_cost || 0)
        }
      }
    });
  })
);

export default router;


























