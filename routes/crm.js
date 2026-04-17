/**
 * CRM integration API.
 * Mounted at /api/crm.
 */
import { Router } from 'express';

/**
 * @param {{ getFullClient: (clientKey: string) => Promise<any> }} deps
 */
export function createCrmRouter(deps) {
  const { getFullClient } = deps || {};
  const router = Router();

  router.post('/hubspot/sync', async (req, res) => {
    try {
      const { clientKey, hubspotApiKey, syncOptions } = req.body;

      if (!clientKey || !hubspotApiKey) {
        return res.status(400).json({ ok: false, error: 'clientKey and hubspotApiKey are required' });
      }

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const { HubSpotIntegration, saveCrmSettings, updateLastSync } = await import(
        '../lib/crm-integrations.js'
      );

      await saveCrmSettings(clientKey, 'hubspot', { apiKey: hubspotApiKey });

      const hubspot = new HubSpotIntegration(hubspotApiKey);

      const syncResults = await hubspot.syncAll(clientKey, {
        syncLeads: syncOptions?.syncLeads !== false,
        syncCalls: syncOptions?.syncCalls !== false,
        syncAppointments: syncOptions?.syncAppointments !== false,
        limit: syncOptions?.limit || 100
      });

      await updateLastSync(clientKey, 'hubspot');

      res.json({
        ok: true,
        message: 'HubSpot sync completed',
        status: 'completed',
        results: syncResults
      });
    } catch (error) {
      console.error('[HUBSPOT SYNC ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/salesforce/sync', async (req, res) => {
    try {
      const { clientKey, salesforceCredentials, syncOptions } = req.body;

      if (!clientKey || !salesforceCredentials) {
        return res
          .status(400)
          .json({ ok: false, error: 'clientKey and salesforceCredentials are required' });
      }

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const { SalesforceIntegration, saveCrmSettings, updateLastSync } = await import(
        '../lib/crm-integrations.js'
      );

      const salesforce = new SalesforceIntegration(salesforceCredentials);

      if (salesforceCredentials.clientId && salesforceCredentials.clientSecret) {
        await salesforce.authenticate(
          salesforceCredentials.clientId,
          salesforceCredentials.clientSecret,
          salesforceCredentials.username,
          salesforceCredentials.password,
          salesforceCredentials.securityToken || ''
        );

        await saveCrmSettings(clientKey, 'salesforce', {
          instanceUrl: salesforce.instanceUrl,
          accessToken: salesforce.accessToken,
          apiVersion: salesforce.apiVersion
        });
      }

      const syncResults = await salesforce.syncAll(clientKey, {
        syncLeads: syncOptions?.syncLeads !== false,
        syncAppointments: syncOptions?.syncAppointments !== false,
        limit: syncOptions?.limit || 100
      });

      await updateLastSync(clientKey, 'salesforce');

      res.json({
        ok: true,
        message: 'Salesforce sync completed',
        status: 'completed',
        results: syncResults
      });
    } catch (error) {
      console.error('[SALESFORCE SYNC ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/integrations/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const { getCrmSettings } = await import('../lib/crm-integrations.js');
      const integrations = await getCrmSettings(clientKey);

      res.json({
        ok: true,
        clientKey,
        integrations
      });
    } catch (error) {
      console.error('[CRM INTEGRATIONS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

