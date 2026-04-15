/**
 * Admin API: tenant/client CRUD, search, filter, CSV/JSON export, bulk ops.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import {
  query,
  listClientSummaries,
  getFullClient,
  upsertFullClient,
  deleteClient,
  getLeadsByClient,
  getCallsByTenant
} from '../db.js';
import { getClientsData, getCallsData } from '../lib/admin-hub-data.js';

function convertToCSV(data) {
  if (!data.length) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * @param {{ broadcast: (type: string, data: unknown) => void }} opts
 */
export function createAdminClientsRouter({ broadcast }) {
  const router = Router();

  router.get('/client/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const client = await getFullClient(clientKey);

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const leads = await getLeadsByClient(clientKey, 1000).catch(() => []);
      const calls = await getCallsByTenant(clientKey, 1000).catch(() => []);
      const appointments = await query(
        `
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `,
        [clientKey]
      ).catch(() => ({ rows: [{ count: 0 }] }));

      const recentCalls = (calls || []).slice(0, 10).map((call) => ({
        phone: call.lead_phone,
        status: call.status,
        outcome: call.outcome,
        duration: call.duration,
        timestamp: call.created_at
      }));

      res.json({
        ...client,
        stats: {
          totalLeads: (leads || []).length,
          totalCalls: (calls || []).length,
          totalBookings: parseInt(appointments?.rows?.[0]?.count || 0),
          conversionRate:
            (calls || []).length > 0
              ? (
                  (parseInt(appointments?.rows?.[0]?.count || 0) / (calls || []).length) *
                  100
                ).toFixed(1)
              : 0
        },
        recentCalls
      });
    } catch (error) {
      console.error('Error getting client details:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/client/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const updates = req.body;

      const existingClient = await getFullClient(clientKey);
      if (!existingClient) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const updatedClient = {
        ...existingClient,
        ...updates,
        clientKey
      };

      await upsertFullClient(updatedClient);

      res.json({ success: true, message: 'Client updated successfully' });
    } catch (error) {
      console.error('Error updating client:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/client/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;

      const existingClient = await getFullClient(clientKey);
      if (!existingClient) {
        return res.status(404).json({ error: 'Client not found' });
      }

      await deleteClient(clientKey);

      res.json({ success: true, message: 'Client deleted successfully' });
    } catch (error) {
      console.error('Error deleting client:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/client', async (req, res) => {
    try {
      const {
        businessName,
        industry,
        email,
        phone,
        website,
        primaryService,
        duration,
        timezone,
        workingHours,
        monthlyBudget
      } = req.body;

      const displayName = businessName || req.body.displayName;

      if (!displayName) {
        return res.status(400).json({ error: 'Business name is required' });
      }

      const clientKey = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const calendarConfig = {
        booking: {
          defaultDurationMin: parseInt(duration) || 30,
          timezone: timezone || 'Europe/London',
          businessHours: workingHours || '9am-5pm Mon-Fri'
        },
        services: primaryService
          ? {
              [primaryService.toLowerCase().replace(/\s+/g, '_')]: {
                name: primaryService,
                duration: parseInt(duration) || 30,
                price: null
              }
            }
          : {}
      };

      const newClient = {
        clientKey,
        displayName,
        industry: industry || 'Not specified',
        email: email || `${clientKey}@example.com`,
        timezone: timezone || 'Europe/London',
        isEnabled: true,
        calendar_json: JSON.stringify(calendarConfig)
      };

      await upsertFullClient(newClient);

      res.json({
        success: true,
        message: 'Client created successfully',
        clientKey,
        ...newClient
      });

      broadcast('clients', await getClientsData());
    } catch (error) {
      console.error('Error creating client:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const { q, type, filters } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      const results = {
        clients: [],
        leads: [],
        calls: [],
        appointments: []
      };

      if (!type || type === 'clients') {
        const clients = await listClientSummaries();
        results.clients = clients.filter(
          (client) =>
            client.displayName?.toLowerCase().includes(q.toLowerCase()) ||
            client.clientKey?.toLowerCase().includes(q.toLowerCase()) ||
            client.industry?.toLowerCase().includes(q.toLowerCase())
        );
      }

      if (!type || type === 'leads') {
        const leads = await query(
          `
        SELECT l.*, t.display_name as client_name 
        FROM leads l 
        JOIN tenants t ON l.client_key = t.client_key 
        WHERE l.name ILIKE $1 OR l.phone ILIKE $1 OR l.service ILIKE $1
        ORDER BY l.created_at DESC 
        LIMIT 50
      `,
          [`%${q}%`]
        );

        results.leads = leads.rows || [];
      }

      if (!type || type === 'calls') {
        const calls = await query(
          `
        SELECT c.*, t.display_name as client_name 
        FROM calls c 
        JOIN tenants t ON c.client_key = t.client_key 
        WHERE c.lead_phone ILIKE $1 OR c.outcome ILIKE $1 OR c.status ILIKE $1
        ORDER BY c.created_at DESC 
        LIMIT 50
      `,
          [`%${q}%`]
        );

        results.calls = calls.rows || [];
      }

      res.json(results);
    } catch (error) {
      console.error('Error performing search:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/filter', async (req, res) => {
    try {
      const { type, filters } = req.query;
      const filterObj = filters ? JSON.parse(filters) : {};

      let results = [];

      switch (type) {
        case 'clients': {
          const clients = await listClientSummaries();
          results = clients.filter((client) => {
            if (filterObj.status && client.isEnabled !== (filterObj.status === 'active')) return false;
            if (filterObj.industry && client.industry !== filterObj.industry) return false;
            if (filterObj.dateFrom && new Date(client.createdAt) < new Date(filterObj.dateFrom)) return false;
            if (filterObj.dateTo && new Date(client.createdAt) > new Date(filterObj.dateTo)) return false;
            return true;
          });
          break;
        }

        case 'calls': {
          const calls = await query(
            `
          SELECT c.*, t.display_name as client_name 
          FROM calls c 
          JOIN tenants t ON c.client_key = t.client_key 
          WHERE ($1::text IS NULL OR c.status = $1)
            AND ($2::text IS NULL OR c.outcome = $2)
            AND ($3::timestamp IS NULL OR c.created_at >= $3)
            AND ($4::timestamp IS NULL OR c.created_at <= $4)
          ORDER BY c.created_at DESC 
          LIMIT 100
        `,
            [
              filterObj.status || null,
              filterObj.outcome || null,
              filterObj.dateFrom || null,
              filterObj.dateTo || null
            ]
          );
          results = calls.rows || [];
          break;
        }

        case 'leads': {
          const leads = await query(
            `
          SELECT l.*, t.display_name as client_name 
          FROM leads l 
          JOIN tenants t ON l.client_key = t.client_key 
          WHERE ($1::text IS NULL OR l.status = $1)
            AND ($2::text IS NULL OR l.source = $2)
            AND ($3::timestamp IS NULL OR l.created_at >= $3)
            AND ($4::timestamp IS NULL OR l.created_at <= $4)
          ORDER BY l.created_at DESC 
          LIMIT 100
        `,
            [
              filterObj.status || null,
              filterObj.source || null,
              filterObj.dateFrom || null,
              filterObj.dateTo || null
            ]
          );
          results = leads.rows || [];
          break;
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Error applying filters:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/export/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const { format = 'csv' } = req.query;

      let data = [];
      let filename = '';

      switch (type) {
        case 'clients':
          data = await getClientsData();
          filename = `clients-export-${new Date().toISOString().split('T')[0]}`;
          break;

        case 'calls':
          data = await getCallsData();
          filename = `calls-export-${new Date().toISOString().split('T')[0]}`;
          break;

        case 'leads': {
          const leads = await query(`
          SELECT l.*, t.display_name as client_name 
          FROM leads l 
          JOIN tenants t ON l.client_key = t.client_key 
          ORDER BY l.created_at DESC
        `);
          data = leads.rows || [];
          filename = `leads-export-${new Date().toISOString().split('T')[0]}`;
          break;
        }

        default:
          return res.status(400).json({ error: 'Invalid export type' });
      }

      if (format === 'csv') {
        const csv = convertToCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(data);
      } else {
        return res.status(400).json({ error: 'Invalid format. Use csv or json' });
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/bulk/:operation', async (req, res) => {
    try {
      const { operation } = req.params;
      const { items, action } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Items array is required' });
      }

      let results = [];

      switch (operation) {
        case 'clients':
          for (const item of items) {
            try {
              if (action === 'delete') {
                await deleteClient(item.clientKey);
                results.push({ id: item.clientKey, status: 'deleted' });
              } else if (action === 'update') {
                await upsertFullClient(item);
                results.push({ id: item.clientKey, status: 'updated' });
              }
            } catch (error) {
              results.push({ id: item.clientKey, status: 'error', error: error.message });
            }
          }
          break;

        case 'leads':
          for (const item of items) {
            try {
              if (action === 'update') {
                await query(
                  `
                UPDATE leads 
                SET status = $1, notes = $2 
                WHERE id = $3
              `,
                  [item.status, item.notes, item.id]
                );
                results.push({ id: item.id, status: 'updated' });
              }
            } catch (error) {
              results.push({ id: item.id, status: 'error', error: error.message });
            }
          }
          break;
      }

      res.json({
        success: true,
        processed: results.length,
        results
      });
    } catch (error) {
      console.error('Error performing bulk operation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
