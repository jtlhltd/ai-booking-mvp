// lib/customer-profiles.js
// Customer profile management for recognition and personalization

import { query } from '../db.js';
import { findAppointments } from './appointment-lookup.js';

/**
 * Get or create customer profile
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function getCustomerProfile({ clientKey, phoneNumber }) {
  try {
    // Try to get from customer_profiles table
    const profileResult = await query(`
      SELECT 
        id,
        name,
        email,
        phone,
        preferences_json,
        vip_status,
        special_notes,
        last_interaction,
        total_appointments,
        created_at
      FROM customer_profiles
      WHERE client_key = $1 AND phone = $2
      LIMIT 1
    `, [clientKey, phoneNumber]);

    if (profileResult.rows.length > 0) {
      const profile = profileResult.rows[0];
      
      // Enrich with appointment history
      const appointments = await findAppointments({
        clientKey,
        phoneNumber,
        limit: 5
      });

      const lastAppointment = appointments.length > 0 ? appointments[0] : null;

      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        preferences: profile.preferences_json || {},
        vipStatus: profile.vip_status || false,
        specialNotes: profile.special_notes,
        lastInteraction: profile.last_interaction,
        totalAppointments: profile.total_appointments || 0,
        lastAppointment: lastAppointment ? {
          date: lastAppointment.startTime,
          service: lastAppointment.customer.service
        } : null,
        preferredService: profile.preferences_json?.preferredService || null,
        createdAt: profile.created_at
      };
    }

    // Fallback: Check leads table
    const leadResult = await query(`
      SELECT 
        id,
        name,
        phone,
        email,
        service,
        status,
        created_at
      FROM leads
      WHERE client_key = $1 AND phone = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [clientKey, phoneNumber]);

    if (leadResult.rows.length > 0) {
      const lead = leadResult.rows[0];
      
      // Create profile from lead
      const profile = {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        preferences: {},
        vipStatus: false,
        specialNotes: null,
        lastInteraction: lead.created_at,
        totalAppointments: 0,
        lastAppointment: null,
        preferredService: lead.service,
        createdAt: lead.created_at
      };

      // Try to get appointment count
      const apptResult = await query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE client_key = $1 AND lead_id = $2
      `, [clientKey, lead.id]);

      profile.totalAppointments = parseInt(apptResult.rows[0]?.count || 0);

      return profile;
    }

    // No profile found
    return null;

  } catch (error) {
    console.error('[CUSTOMER PROFILES] Error getting profile:', error);
    return null;
  }
}

/**
 * Create or update customer profile
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function upsertCustomerProfile({
  clientKey,
  phoneNumber,
  name = null,
  email = null,
  preferences = null,
  vipStatus = null,
  specialNotes = null
}) {
  try {
    // Get existing profile
    const existing = await getCustomerProfile({ clientKey, phoneNumber });

    const updateName = name || existing?.name;
    const updateEmail = email || existing?.email;
    const updatePreferences = preferences || existing?.preferences || {};
    const updateVipStatus = vipStatus !== null ? vipStatus : (existing?.vipStatus || false);
    const updateSpecialNotes = specialNotes || existing?.specialNotes;

    await query(`
      INSERT INTO customer_profiles (
        client_key,
        phone,
        name,
        email,
        preferences_json,
        vip_status,
        special_notes,
        last_interaction,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (client_key, phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, customer_profiles.name),
        email = COALESCE(EXCLUDED.email, customer_profiles.email),
        preferences_json = EXCLUDED.preferences_json,
        vip_status = EXCLUDED.vip_status,
        special_notes = COALESCE(EXCLUDED.special_notes, customer_profiles.special_notes),
        last_interaction = NOW(),
        updated_at = NOW()
    `, [
      clientKey,
      phoneNumber,
      updateName,
      updateEmail,
      JSON.stringify(updatePreferences),
      updateVipStatus,
      updateSpecialNotes
    ]);

    console.log('[CUSTOMER PROFILES] ✅ Profile upserted:', { clientKey, phoneNumber });

    return {
      success: true,
      profile: await getCustomerProfile({ clientKey, phoneNumber })
    };

  } catch (error) {
    console.error('[CUSTOMER PROFILES] Error upserting profile:', error);
    throw error;
  }
}

/**
 * Update customer preferences
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function updateCustomerPreferences({
  clientKey,
  phoneNumber,
  preferences
}) {
  try {
    const existing = await getCustomerProfile({ clientKey, phoneNumber });
    
    const mergedPreferences = {
      ...(existing?.preferences || {}),
      ...preferences
    };

    await query(`
      UPDATE customer_profiles
      SET 
        preferences_json = $1,
        updated_at = NOW()
      WHERE client_key = $2 AND phone = $3
    `, [JSON.stringify(mergedPreferences), clientKey, phoneNumber]);

    return {
      success: true,
      preferences: mergedPreferences
    };

  } catch (error) {
    console.error('[CUSTOMER PROFILES] Error updating preferences:', error);
    throw error;
  }
}

/**
 * Update appointment count (called after booking)
 * @param {Object} params
 */
export async function incrementAppointmentCount({ clientKey, phoneNumber }) {
  try {
    await query(`
      UPDATE customer_profiles
      SET 
        total_appointments = total_appointments + 1,
        last_interaction = NOW(),
        updated_at = NOW()
      WHERE client_key = $1 AND phone = $2
    `, [clientKey, phoneNumber]);

  } catch (error) {
    // Profile might not exist yet - that's okay
    console.log('[CUSTOMER PROFILES] Could not increment count (profile may not exist):', error.message);
  }
}

/**
 * Set VIP status
 * @param {Object} params
 */
export async function setVipStatus({ clientKey, phoneNumber, vipStatus }) {
  try {
    await query(`
      UPDATE customer_profiles
      SET 
        vip_status = $1,
        updated_at = NOW()
      WHERE client_key = $2 AND phone = $3
    `, [vipStatus, clientKey, phoneNumber]);

    console.log('[CUSTOMER PROFILES] ✅ VIP status updated:', { clientKey, phoneNumber, vipStatus });

  } catch (error) {
    console.error('[CUSTOMER PROFILES] Error setting VIP status:', error);
    throw error;
  }
}

/**
 * Get customer greeting text
 * @param {Object} params
 * @returns {Promise<string>}
 */
export async function getCustomerGreeting({ clientKey, phoneNumber }) {
  try {
    const profile = await getCustomerProfile({ clientKey, phoneNumber });

    if (!profile) {
      return null; // Not a known customer
    }

    let greeting = `Hi ${profile.name || 'there'}`;

    if (profile.totalAppointments > 0) {
      greeting += `, welcome back!`;
      
      if (profile.lastAppointment) {
        const lastDate = new Date(profile.lastAppointment.date);
        const daysAgo = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        
        if (daysAgo < 30) {
          greeting += ` It's been a while since your last visit.`;
        }
      }
    }

    if (profile.vipStatus) {
      greeting += ` We appreciate your continued business!`;
    }

    return greeting;

  } catch (error) {
    console.error('[CUSTOMER PROFILES] Error getting greeting:', error);
    return null;
  }
}

