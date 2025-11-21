// routes/receptionist.js
// API endpoints for receptionist features (business info, customer profiles, messages)

import express from 'express';
import { getBusinessInfo, updateBusinessInfo, getBusinessHoursString, getServicesList, answerQuestion, upsertFAQ } from '../lib/business-info.js';
import { getCustomerProfile, upsertCustomerProfile, updateCustomerPreferences, setVipStatus, getCustomerGreeting } from '../lib/customer-profiles.js';
import { authenticateApiKey, requireTenantAccess } from '../middleware/security.js';
import { query } from '../db.js';

const router = express.Router();

// ==================== BUSINESS INFO ====================

/**
 * GET /api/receptionist/:clientKey/business-info
 * Get business information
 */
router.get('/api/receptionist/:clientKey/business-info', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const info = await getBusinessInfo(clientKey);

    res.json({
      success: true,
      info
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/receptionist/:clientKey/business-info
 * Update business information
 */
router.put('/api/receptionist/:clientKey/business-info', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { hours, services, policies, location } = req.body;

    const result = await updateBusinessInfo({
      clientKey,
      hours: hours || null,
      services: services || null,
      policies: policies || null,
      location: location || null
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/receptionist/:clientKey/answer-question
 * Answer a question using FAQ
 */
router.get('/api/receptionist/:clientKey/answer-question', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { question } = req.query;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Question parameter required'
      });
    }

    const result = await answerQuestion({ clientKey, question });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/receptionist/:clientKey/faq
 * Add or update FAQ
 */
router.post('/api/receptionist/:clientKey/faq', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { question, answer, category, priority } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        error: 'Question and answer required'
      });
    }

    const result = await upsertFAQ({
      clientKey,
      question,
      answer,
      category: category || null,
      priority: priority || 0
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CUSTOMER PROFILES ====================

/**
 * GET /api/receptionist/:clientKey/customer/:phone
 * Get customer profile
 */
router.get('/api/receptionist/:clientKey/customer/:phone', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, phone } = req.params;

    const profile = await getCustomerProfile({ clientKey, phoneNumber: phone });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/receptionist/:clientKey/customer/:phone
 * Create or update customer profile
 */
router.put('/api/receptionist/:clientKey/customer/:phone', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, phone } = req.params;
    const { name, email, preferences, vipStatus, specialNotes } = req.body;

    const result = await upsertCustomerProfile({
      clientKey,
      phoneNumber: phone,
      name: name || null,
      email: email || null,
      preferences: preferences || null,
      vipStatus: vipStatus !== undefined ? vipStatus : null,
      specialNotes: specialNotes || null
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/receptionist/:clientKey/customer/:phone/vip
 * Set VIP status
 */
router.post('/api/receptionist/:clientKey/customer/:phone/vip', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, phone } = req.params;
    const { vipStatus } = req.body;

    await setVipStatus({
      clientKey,
      phoneNumber: phone,
      vipStatus: vipStatus === true
    });

    res.json({
      success: true,
      message: `VIP status ${vipStatus ? 'enabled' : 'disabled'}`
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MESSAGES ====================

/**
 * GET /api/receptionist/:clientKey/messages
 * Get messages (voicemail/messages)
 */
router.get('/api/receptionist/:clientKey/messages', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { status = 'new', limit = 50 } = req.query;

    const result = await query(`
      SELECT 
        id,
        call_id,
        caller_name,
        caller_phone,
        caller_email,
        reason,
        message_body,
        preferred_callback_time,
        urgency,
        status,
        created_at,
        responded_at
      FROM messages
      WHERE client_key = $1 AND status = $2
      ORDER BY 
        CASE urgency
          WHEN 'emergency' THEN 1
          WHEN 'urgent' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT $3
    `, [clientKey, status, parseInt(limit)]);

    res.json({
      success: true,
      count: result.rows.length,
      messages: result.rows
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/receptionist/:clientKey/messages/:messageId/respond
 * Mark message as responded
 */
router.post('/api/receptionist/:clientKey/messages/:messageId/respond', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, messageId } = req.params;

    await query(`
      UPDATE messages
      SET 
        status = 'responded',
        responded_at = NOW()
      WHERE id = $1 AND client_key = $2
    `, [messageId, clientKey]);

    res.json({
      success: true,
      message: 'Message marked as responded'
    });

  } catch (error) {
    console.error('[RECEPTIONIST API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;























