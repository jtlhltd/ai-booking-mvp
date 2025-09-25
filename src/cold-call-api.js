// Cold Call Campaign API Endpoints
// Handles campaign management, analytics, and lead processing

import { EnhancedColdCallBot, ColdCallCampaignManager } from './enhanced-cold-call-bot.js';
import { readJson, writeJson } from './db.js';

const CAMPAIGNS_PATH = './data/cold-call-campaigns.json';
const LEADS_PATH = './data/cold-call-leads.json';
const ANALYTICS_PATH = './data/cold-call-analytics.json';

// Initialize campaign manager
const campaignManager = new ColdCallCampaignManager();

// Load existing data
async function loadCampaignData() {
  try {
    const campaigns = await readJson(CAMPAIGNS_PATH, []);
    const leads = await readJson(LEADS_PATH, []);
    const analytics = await readJson(ANALYTICS_PATH, {});
    
    // Restore campaigns to manager
    campaigns.forEach(campaign => {
      campaignManager.campaigns.set(campaign.id, campaign);
    });
    
    return { campaigns, leads, analytics };
  } catch (error) {
    console.error('Error loading campaign data:', error);
    return { campaigns: [], leads: [], analytics: {} };
  }
}

// Save campaign data
async function saveCampaignData() {
  try {
    const campaigns = Array.from(campaignManager.campaigns.values());
    await writeJson(CAMPAIGNS_PATH, campaigns);
    await writeJson(LEADS_PATH, campaignManager.leadQueue);
    await writeJson(ANALYTICS_PATH, campaignManager.results);
  } catch (error) {
    console.error('Error saving campaign data:', error);
  }
}

// API Middleware for authentication
function authenticateApiKey(req, res, next) {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Campaign Management Endpoints
export function setupColdCallAPI(app) {
  
  // Get all campaigns
  app.get('/api/cold-call/campaigns', authenticateApiKey, async (req, res) => {
    try {
      const { campaigns } = await loadCampaignData();
      res.json(campaigns);
    } catch (error) {
      console.error('Error getting campaigns:', error);
      res.status(500).json({ error: 'Failed to get campaigns' });
    }
  });

  // Create new campaign
  app.post('/api/cold-call/campaigns', authenticateApiKey, async (req, res) => {
    try {
      const { name, targetIndustry, maxCallsPerDay } = req.body;
      
      const campaign = campaignManager.createCampaign({
        name: name || 'New Cold Call Campaign',
        targetIndustry: targetIndustry || 'dental',
        maxCallsPerDay: maxCallsPerDay || 50
      });
      
      await saveCampaignData();
      
      res.json({
        ok: true,
        campaign,
        message: 'Campaign created successfully'
      });
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  });

  // Update campaign
  app.put('/api/cold-call/campaigns/:id', authenticateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const campaign = campaignManager.campaigns.get(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      Object.assign(campaign, updates);
      await saveCampaignData();
      
      res.json({
        ok: true,
        campaign,
        message: 'Campaign updated successfully'
      });
    } catch (error) {
      console.error('Error updating campaign:', error);
      res.status(500).json({ error: 'Failed to update campaign' });
    }
  });

  // Delete campaign
  app.delete('/api/cold-call/campaigns/:id', authenticateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      
      const campaign = campaignManager.campaigns.get(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      campaignManager.campaigns.delete(id);
      await saveCampaignData();
      
      res.json({
        ok: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      res.status(500).json({ error: 'Failed to delete campaign' });
    }
  });

  // Start campaign
  app.post('/api/cold-call/start', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId } = req.body;
      
      if (campaignId) {
        const campaign = campaignManager.campaigns.get(campaignId);
        if (!campaign) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        campaign.status = 'active';
      } else {
        // Start all campaigns
        campaignManager.campaigns.forEach(campaign => {
          campaign.status = 'active';
        });
      }
      
      await saveCampaignData();
      
      // Start processing queue
      setInterval(() => {
        campaignManager.processCampaignQueue();
      }, 60000); // Process every minute
      
      res.json({
        ok: true,
        message: 'Campaign started successfully'
      });
    } catch (error) {
      console.error('Error starting campaign:', error);
      res.status(500).json({ error: 'Failed to start campaign' });
    }
  });

  // Pause campaign
  app.post('/api/cold-call/pause', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId } = req.body;
      
      if (campaignId) {
        const campaign = campaignManager.campaigns.get(campaignId);
        if (!campaign) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        campaign.status = 'paused';
      } else {
        // Pause all campaigns
        campaignManager.campaigns.forEach(campaign => {
          campaign.status = 'paused';
        });
      }
      
      await saveCampaignData();
      
      res.json({
        ok: true,
        message: 'Campaign paused successfully'
      });
    } catch (error) {
      console.error('Error pausing campaign:', error);
      res.status(500).json({ error: 'Failed to pause campaign' });
    }
  });

  // Stop campaign
  app.post('/api/cold-call/stop', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId } = req.body;
      
      if (campaignId) {
        const campaign = campaignManager.campaigns.get(campaignId);
        if (!campaign) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        campaign.status = 'stopped';
      } else {
        // Stop all campaigns
        campaignManager.campaigns.forEach(campaign => {
          campaign.status = 'stopped';
        });
      }
      
      await saveCampaignData();
      
      res.json({
        ok: true,
        message: 'Campaign stopped successfully'
      });
    } catch (error) {
      console.error('Error stopping campaign:', error);
      res.status(500).json({ error: 'Failed to stop campaign' });
    }
  });

  // Add leads to campaign
  app.post('/api/cold-call/leads', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId, leads } = req.body;
      
      if (!campaignId || !leads || !Array.isArray(leads)) {
        return res.status(400).json({ error: 'Campaign ID and leads array are required' });
      }
      
      const campaign = campaignManager.campaigns.get(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      campaignManager.addLeadsToCampaign(campaignId, leads);
      await saveCampaignData();
      
      res.json({
        ok: true,
        message: `Added ${leads.length} leads to campaign`,
        leadsAdded: leads.length
      });
    } catch (error) {
      console.error('Error adding leads:', error);
      res.status(500).json({ error: 'Failed to add leads' });
    }
  });

  // Get lead queue
  app.get('/api/cold-call/queue', authenticateApiKey, async (req, res) => {
    try {
      const { status, limit } = req.query;
      
      let leads = campaignManager.leadQueue;
      
      if (status) {
        leads = leads.filter(lead => lead.status === status);
      }
      
      if (limit) {
        leads = leads.slice(0, parseInt(limit));
      }
      
      res.json(leads);
    } catch (error) {
      console.error('Error getting lead queue:', error);
      res.status(500).json({ error: 'Failed to get lead queue' });
    }
  });

  // Process lead queue
  app.post('/api/cold-call/process-queue', authenticateApiKey, async (req, res) => {
    try {
      await campaignManager.processCampaignQueue();
      await saveCampaignData();
      
      res.json({
        ok: true,
        message: 'Lead queue processed successfully'
      });
    } catch (error) {
      console.error('Error processing queue:', error);
      res.status(500).json({ error: 'Failed to process queue' });
    }
  });

  // Get campaign analytics
  app.get('/api/cold-call/analytics', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId } = req.query;
      
      if (campaignId) {
        const analytics = campaignManager.getCampaignAnalytics(campaignId);
        if (!analytics) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(analytics);
      } else {
        // Get overall analytics
        const campaigns = Array.from(campaignManager.campaigns.values());
        const totalCalls = campaigns.reduce((sum, c) => sum + (c.results.totalCalls || 0), 0);
        const totalAppointments = campaigns.reduce((sum, c) => sum + (c.results.appointmentsBooked || 0), 0);
        const totalRevenue = campaigns.reduce((sum, c) => sum + (c.results.revenue || 0), 0);
        
        const analytics = {
          totalCalls,
          appointmentsBooked: totalAppointments,
          conversionRate: totalCalls > 0 ? (totalAppointments / totalCalls * 100).toFixed(1) : 0,
          estimatedRevenue: totalRevenue,
          activeCampaigns: campaigns.filter(c => c.status === 'active').length,
          totalCampaigns: campaigns.length
        };
        
        res.json(analytics);
      }
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  });

  // Create VAPI assistant for cold calling
  app.post('/api/cold-call/create-assistant', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId, assistantConfig } = req.body;
      
      const campaign = campaignManager.campaigns.get(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const bot = new EnhancedColdCallBot();
      const assistantData = bot.getEnhancedConversationFlow();
      
      // Create VAPI assistant
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: assistantData.name,
          firstMessage: assistantData.firstMessage,
          systemMessage: assistantData.systemMessage,
          maxDurationSeconds: assistantData.maxDurationSeconds,
          endCallMessage: assistantData.endCallMessage,
          variableValues: assistantData.variableValues,
          ...assistantConfig
        })
      });
      
      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
      }
      
      const assistant = await vapiResponse.json();
      
      // Update campaign with assistant ID
      campaign.assistantId = assistant.id;
      await saveCampaignData();
      
      res.json({
        ok: true,
        assistant,
        message: 'Assistant created successfully'
      });
    } catch (error) {
      console.error('Error creating assistant:', error);
      res.status(500).json({ error: 'Failed to create assistant' });
    }
  });

  // Make individual call
  app.post('/api/cold-call/make-call', authenticateApiKey, async (req, res) => {
    try {
      const { campaignId, leadId, assistantId } = req.body;
      
      const campaign = campaignManager.campaigns.get(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const lead = campaignManager.leadQueue.find(l => l.id === leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      const bot = new EnhancedColdCallBot();
      const script = bot.generatePersonalizedScript(lead);
      
      // Make VAPI call
      const callData = {
        assistantId: assistantId || campaign.assistantId,
        customer: {
          number: lead.business.phone,
          name: lead.decisionMaker?.name || lead.business.name
        },
        metadata: {
          campaignId,
          leadId,
          practiceName: lead.business.name,
          decisionMaker: lead.decisionMaker,
          script: script
        }
      };
      
      const vapiResponse = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(callData)
      });
      
      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
      }
      
      const call = await vapiResponse.json();
      
      // Update lead status
      lead.status = 'called';
      lead.callId = call.id;
      lead.calledAt = new Date().toISOString();
      
      // Update campaign results
      campaign.results.totalCalls = (campaign.results.totalCalls || 0) + 1;
      
      await saveCampaignData();
      
      res.json({
        ok: true,
        call,
        message: 'Call initiated successfully'
      });
    } catch (error) {
      console.error('Error making call:', error);
      res.status(500).json({ error: 'Failed to make call' });
    }
  });

  // Webhook for VAPI call results
  app.post('/webhooks/vapi-cold-call', async (req, res) => {
    try {
      const { callId, status, transcript, summary, metadata } = req.body;
      
      if (!callId || !metadata) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const { campaignId, leadId } = metadata;
      
      // Find lead and update status
      const lead = campaignManager.leadQueue.find(l => l.id === leadId);
      if (lead) {
        lead.callStatus = status;
        lead.transcript = transcript;
        lead.summary = summary;
        lead.completedAt = new Date().toISOString();
        
        // Update campaign results based on call outcome
        const campaign = campaignManager.campaigns.get(campaignId);
        if (campaign) {
          if (status === 'completed' && summary?.includes('appointment')) {
            campaign.results.appointmentsBooked = (campaign.results.appointmentsBooked || 0) + 1;
            campaign.results.revenue = (campaign.results.revenue || 0) + 6000; // £500/month * 12 months
          }
          
          // Update conversion rate
          const conversionRate = campaign.results.totalCalls > 0 
            ? (campaign.results.appointmentsBooked / campaign.results.totalCalls * 100).toFixed(1)
            : 0;
          campaign.results.conversionRate = conversionRate;
        }
      }
      
      await saveCampaignData();
      
      res.json({ ok: true, message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  // Initialize data on startup
  loadCampaignData().catch(console.error);
}

export default setupColdCallAPI;
