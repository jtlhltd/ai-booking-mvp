/**
 * Admin API: call recordings CRUD + playback helpers.
 * Mounted at /api/admin — paths here are /call-recordings...
 */
import { Router } from 'express';
import { query } from '../db.js';

export function createAdminCallRecordingsRouter() {
  const router = Router();

  router.get('/call-recordings', async (req, res) => {
    try {
      const { clientKey, leadPhone, callId } = req.query;

      let q = `
      SELECT
        r.*,
        c.display_name as client_name,
        l.name as lead_name,
        cl.duration as call_duration,
        cl.outcome as call_outcome
      FROM call_recordings r
      LEFT JOIN tenants c ON r.client_key = c.client_key
      LEFT JOIN leads l ON r.lead_phone = l.phone
      LEFT JOIN calls cl ON r.call_id = cl.call_id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        q += ` AND r.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (leadPhone) {
        q += ` AND r.lead_phone = $${paramCount++}`;
        params.push(leadPhone);
      }

      if (callId) {
        q += ` AND r.call_id = $${paramCount++}`;
        params.push(callId);
      }

      q += ` ORDER BY r.created_at DESC`;

      const recordings = await query(q, params);
      res.json(recordings.rows || []);
    } catch (error) {
      console.error('Error getting call recordings:', error);
      res.json([]);
    }
  });

  router.post('/call-recordings', async (req, res) => {
    try {
      const { callId, clientKey, leadPhone, recordingUrl, transcript, duration, metadata } = req.body;

      const result = await query(
        `
      INSERT INTO call_recordings (
        call_id, client_key, lead_phone, recording_url, transcript,
        duration, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `,
        [callId, clientKey, leadPhone, recordingUrl, transcript, duration, JSON.stringify(metadata || {})]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating call recording:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/call-recordings/:recordingId/play', async (req, res) => {
    try {
      const { recordingId } = req.params;

      const result = await query(
        `
      SELECT recording_url FROM call_recordings WHERE id = $1
    `,
        [recordingId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      res.redirect(result.rows[0].recording_url);
    } catch (error) {
      console.error('Error playing recording:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/call-recordings/:recordingId/transcript', async (req, res) => {
    try {
      const { recordingId } = req.params;

      const result = await query(
        `
      SELECT transcript FROM call_recordings WHERE id = $1
    `,
        [recordingId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      res.json({ transcript: result.rows[0].transcript });
    } catch (error) {
      console.error('Error getting transcript:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/call-recordings/:recordingId', async (req, res) => {
    try {
      const { recordingId } = req.params;

      await query(
        `
      DELETE FROM call_recordings WHERE id = $1
    `,
        [recordingId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting recording:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

