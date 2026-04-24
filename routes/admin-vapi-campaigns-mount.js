import { Router } from 'express';
import { nanoid } from 'nanoid';

export function createAdminVapiCampaignsRouter(deps) {
  const {
    getApiKey,
    startColdCallCampaign,
    getOptimalCallTime,
    generateFollowUpPlan,
    generateVoicemailFollowUpEmail,
    generateDemoConfirmationEmail,
    generateObjectionHandlingEmail,
    generatePersonalizedScript,
  } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // Create Cold Call Assistant for Dental Practices
  router.post('/admin/vapi/cold-call-assistant', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      console.log('[COLD CALL ASSISTANT CREATION REQUESTED]', {
        requestedBy: req.ip,
      });

      // Check if VAPI API key is configured
      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          error: 'VAPI API key not configured',
          message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables',
        });
      }

      // Create specialized cold calling assistant for dental practices
      const coldCallAssistant = {
        name: 'Dental Cold Call Bot - £500/mo',
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          maxTokens: 200,
        },
        voice: {
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          stability: 0.7,
          clarity: 0.85,
          style: 0.2,
          similarityBoost: 0.8,
        },
        firstMessage:
          "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
        systemMessage: `You are Sarah, a top-performing sales professional with 10+ years experience in B2B healthcare sales. You're calling business owners/managers to book qualified appointments.

ADVANCED SALES PSYCHOLOGY:
- Use social proof: "We help businesses improve their appointment booking systems"
- Create urgency: "We're currently accepting new clients"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our service can help capture more appointments"
- Address pain points: "Many businesses lose potential customers from missed calls"

CONVERSATION FLOW:
1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month"
   - "Our AI handles calls 24/7, so you never miss another patient"

4. VALUE PRESENTATION (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Premium service includes dedicated account manager and priority support"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"

5. OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly"
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager"
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?"
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management and priority support"
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?"

6. CLOSING (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"

ADVANCED TECHNIQUES:
- Use their name frequently (builds rapport)
- Mirror their language and pace
- Ask open-ended questions
- Use "we" instead of "I" (creates partnership)
- Create urgency with scarcity
- Use specific success stories
- Address objections before they're raised

RULES:
- Keep calls under 3 minutes
- Be professional but warm
- Listen 70% of the time, talk 30%
- Focus on their pain points
- Always ask for the appointment
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name in conversation
- End with a clear next step`,
        maxDurationSeconds: 180, // 3 minutes max
        endCallMessage:
          "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
        endCallPhrases: ['not interested', 'not right now', 'call back later', 'send me information'],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
        backgroundSound: 'office',
        silenceTimeoutSeconds: 10,
        responseDelaySeconds: 1,
        llmRequestDelaySeconds: 0.1,
      };

      // Create assistant via VAPI API
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(coldCallAssistant),
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error('[VAPI ASSISTANT CREATION ERROR]', errorData);
        return res.status(400).json({
          error: 'Failed to create VAPI assistant',
          details: errorData,
        });
      }

      const assistantData = await vapiResponse.json();

      console.log('[COLD CALL ASSISTANT CREATED]', {
        assistantId: assistantData.id,
        name: assistantData.name,
      });

      res.json({
        success: true,
        message: 'Cold call assistant created successfully',
        assistant: {
          id: assistantData.id,
          name: assistantData.name,
          status: assistantData.status,
          createdAt: assistantData.createdAt,
        },
      });
    } catch (error) {
      console.error('[COLD CALL ASSISTANT CREATION ERROR]', error);
      res.status(500).json({
        error: 'Failed to create cold call assistant',
        message: error.message,
      });
    }
  });

  // Cold Call Campaign Management
  router.post('/admin/vapi/cold-call-campaign', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { assistantId, businesses, campaignName, maxCallsPerDay, startTime, endTime } = req.body;

      if (!assistantId || !businesses || !Array.isArray(businesses)) {
        return res.status(400).json({ error: 'Assistant ID and businesses array are required' });
      }

      console.log('[COLD CALL CAMPAIGN CREATED]', {
        campaignName: campaignName || 'Dental Practice Campaign',
        businessCount: businesses.length,
        assistantId,
        requestedBy: req.ip,
      });

      // Create campaign in database
      const campaignId = nanoid();
      const campaign = {
        id: campaignId,
        name: campaignName || 'Dental Practice Campaign',
        assistantId,
        businesses: businesses.map((business) => ({
          id: business.id || nanoid(),
          name: business.name,
          phone: business.phone,
          email: business.email,
          address: business.address,
          website: business.website,
          decisionMaker: business.decisionMaker,
          status: 'pending',
          attempts: 0,
          lastAttempt: null,
          notes: '',
        })),
        status: 'active',
        maxCallsPerDay: maxCallsPerDay || 100,
        startTime: startTime || '09:00',
        endTime: endTime || '17:00',
        createdAt: new Date().toISOString(),
        stats: {
          totalCalls: 0,
          successfulCalls: 0,
          appointmentsBooked: 0,
          voicemails: 0,
          noAnswers: 0,
          rejections: 0,
        },
      };

      // Start calling process
      const callResults = await startColdCallCampaign(campaign);

      res.json({
        success: true,
        message: 'Cold call campaign created and started',
        campaign: {
          id: campaignId,
          name: campaign.name,
          businessCount: businesses.length,
          status: 'active',
          stats: campaign.stats,
        },
        callResults,
      });
    } catch (error) {
      console.error('[COLD CALL CAMPAIGN ERROR]', error);
      res.status(500).json({
        error: 'Failed to create cold call campaign',
        message: error.message,
      });
    }
  });

  // A/B Testing for Cold Call Scripts
  router.post('/admin/vapi/ab-test-assistant', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { testName, variants } = req.body;

      if (!testName || !variants || !Array.isArray(variants)) {
        return res.status(400).json({ error: 'Test name and variants array are required' });
      }

      console.log(`[A/B TEST CREATION] Creating test: ${testName} with ${variants.length} variants`);

      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          error: 'VAPI API key not configured',
          message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables',
        });
      }

      const testResults = [];

      // Create multiple assistants with different scripts
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];

        const assistant = {
          name: `${testName} - Variant ${i + 1}`,
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            temperature: variant.temperature || 0.3,
            maxTokens: 200,
          },
          voice: {
            provider: '11labs',
            voiceId: variant.voiceId || '21m00Tcm4TlvDq8ikWAM',
            stability: 0.7,
            clarity: 0.85,
            style: 0.2,
          },
          firstMessage: variant.firstMessage,
          systemMessage: variant.systemMessage,
          maxDurationSeconds: 180,
          endCallMessage:
            "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
          endCallPhrases: ['not interested', 'not right now', 'call back later', 'send me information'],
          recordingEnabled: true,
          voicemailDetectionEnabled: true,
          backgroundSound: 'office',
        };

        const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(assistant),
        });

        if (vapiResponse.ok) {
          const assistantData = await vapiResponse.json();
          testResults.push({
            variant: i + 1,
            assistantId: assistantData.id,
            name: assistantData.name,
            script: variant.scriptName || `Variant ${i + 1}`,
            status: 'created',
          });
        } else {
          testResults.push({
            variant: i + 1,
            status: 'failed',
            error: 'Failed to create assistant',
          });
        }
      }

      res.json({
        success: true,
        testName,
        variants: testResults,
        message: `A/B test created with ${testResults.filter((r) => r.status === 'created').length} variants`,
      });
    } catch (error) {
      console.error('[A/B TEST CREATION ERROR]', error);
      res.status(500).json({
        error: 'Failed to create A/B test',
        message: error.message,
      });
    }
  });

  // Lead Scoring and Qualification System
  router.post('/admin/vapi/lead-scoring', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { businesses } = req.body;

      if (!businesses || !Array.isArray(businesses)) {
        return res.status(400).json({ error: 'Businesses array is required' });
      }

      console.log(`[LEAD SCORING] Scoring ${businesses.length} businesses`);

      const scoredBusinesses = businesses.map((business) => {
        let score = 0;
        const factors = [];

        // Decision maker availability (40 points)
        if (business.decisionMaker?.name) {
          score += 40;
          factors.push('Decision maker identified (+40)');
        }

        // Website quality (20 points)
        if (business.website) {
          score += 20;
          factors.push('Website available (+20)');

          // Check if website looks professional
          if (business.website.includes('https://')) {
            score += 5;
            factors.push('Secure website (+5)');
          }
        }

        // Contact information completeness (15 points)
        if (business.email && business.phone) {
          score += 15;
          factors.push('Complete contact info (+15)');
        } else if (business.phone) {
          score += 10;
          factors.push('Phone available (+10)');
        }

        // Business size indicators (10 points)
        if (business.rating && parseFloat(business.rating) > 4.0) {
          score += 10;
          factors.push('High rating (+10)');
        }

        // Location quality (10 points)
        if (business.address) {
          const address = business.address.toLowerCase();
          if (address.includes('london') || address.includes('manchester') || address.includes('birmingham') || address.includes('leeds')) {
            score += 10;
            factors.push('Major city location (+10)');
          } else {
            score += 5;
            factors.push('UK location (+5)');
          }
        }

        // Industry-specific factors (5 points)
        if (business.services && business.services.length > 0) {
          score += 5;
          factors.push('Services listed (+5)');
        }

        // Determine priority level
        let priority = 'Low';
        if (score >= 80) priority = 'High';
        else if (score >= 60) priority = 'Medium';

        return {
          ...business,
          leadScore: Math.min(score, 100),
          priority,
          scoringFactors: factors,
          recommendedCallTime: getOptimalCallTime(business),
          estimatedConversionProbability: Math.min(score * 0.8, 80), // Max 80% probability
        };
      });

      // Sort by lead score
      scoredBusinesses.sort((a, b) => b.leadScore - a.leadScore);

      res.json({
        success: true,
        totalBusinesses: scoredBusinesses.length,
        highPriority: scoredBusinesses.filter((b) => b.priority === 'High').length,
        mediumPriority: scoredBusinesses.filter((b) => b.priority === 'Medium').length,
        lowPriority: scoredBusinesses.filter((b) => b.priority === 'Low').length,
        businesses: scoredBusinesses,
      });
    } catch (error) {
      console.error('[LEAD SCORING ERROR]', error);
      res.status(500).json({
        error: 'Failed to score leads',
        message: error.message,
      });
    }
  });

  // Advanced Analytics and Optimization
  router.get('/admin/vapi/campaign-analytics/:campaignId', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { campaignId } = req.params;

      // This would typically fetch from your database
      // For now, we'll return sample analytics
      const analytics = {
        campaignId,
        totalCalls: 150,
        successfulCalls: 120,
        appointmentsBooked: 8,
        voicemails: 25,
        noAnswers: 15,
        rejections: 30,
        conversionRate: 6.7, // 8 appointments / 120 successful calls
        costPerCall: 0.25,
        costPerAppointment: 4.69, // (150 * 0.25) / 8
        averageCallDuration: 145, // seconds
        monthlyServiceValue: 500, // £500/month service
        estimatedMonthlyRevenue: 4000, // 8 appointments * £500
        roi: 800, // 4000 / 500 * 100
        bestCallingTimes: {
          '09:00-10:00': 12.5,
          '14:00-15:00': 8.3,
          '16:00-17:00': 7.1,
        },
        topPerformingScripts: [
          { script: 'Pain-focused approach', conversionRate: 8.2 },
          { script: 'Social proof approach', conversionRate: 6.8 },
          { script: 'Urgency approach', conversionRate: 5.9 },
        ],
        objections: {
          'Too expensive': 45,
          'Not interested': 30,
          'Too busy': 15,
          'Already have system': 10,
        },
        recommendations: [
          'Focus on pain amplification - highest conversion rate',
          'Call between 9-10 AM for best results',
          'Address cost objections with ROI calculations',
          'Use social proof more frequently',
        ],
      };

      res.json({
        success: true,
        analytics,
      });
    } catch (error) {
      console.error('[CAMPAIGN ANALYTICS ERROR]', error);
      res.status(500).json({
        error: 'Failed to fetch campaign analytics',
        message: error.message,
      });
    }
  });

  // Multi-Channel Follow-up System
  router.post('/admin/vapi/follow-up-sequence', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { callResults, campaignId } = req.body;

      if (!callResults || !Array.isArray(callResults)) {
        return res.status(400).json({ error: 'Call results array is required' });
      }

      console.log(`[FOLLOW-UP SEQUENCE] Creating follow-up for ${callResults.length} calls`);

      const followUpResults = [];

      for (const call of callResults) {
        const followUp = {
          businessId: call.businessId,
          businessName: call.businessName,
          phone: call.phone,
          email: call.email,
          callOutcome: call.outcome || 'no_answer',
          followUpPlan: generateFollowUpPlan(call),
          scheduledActions: [],
        };

        // Schedule follow-up actions based on call outcome
        if (call.outcome === 'voicemail') {
          followUp.scheduledActions.push({
            type: 'email',
            delay: 'immediate',
            template: 'voicemail_follow_up',
            content: generateVoicemailFollowUpEmail(call),
          });
          followUp.scheduledActions.push({
            type: 'call',
            delay: '2_hours',
            note: 'Retry call after email follow-up',
          });
        } else if (call.outcome === 'interested') {
          followUp.scheduledActions.push({
            type: 'email',
            delay: 'immediate',
            template: 'demo_confirmation',
            content: generateDemoConfirmationEmail(call),
          });
          followUp.scheduledActions.push({
            type: 'calendar_invite',
            delay: 'immediate',
            note: 'Send calendar invite for demo',
          });
        } else if (call.outcome === 'objection') {
          followUp.scheduledActions.push({
            type: 'email',
            delay: '1_day',
            template: 'objection_handling',
            content: generateObjectionHandlingEmail(call),
          });
          followUp.scheduledActions.push({
            type: 'call',
            delay: '3_days',
            note: 'Follow-up call to address objections',
          });
        }

        followUpResults.push(followUp);
      }

      res.json({
        success: true,
        campaignId,
        totalFollowUps: followUpResults.length,
        followUps: followUpResults,
      });
    } catch (error) {
      console.error('[FOLLOW-UP SEQUENCE ERROR]', error);
      res.status(500).json({
        error: 'Failed to create follow-up sequence',
        message: error.message,
      });
    }
  });

  // Dynamic Script Personalization System
  router.post('/admin/vapi/personalized-assistant', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          error: 'VAPI API key not configured. Set VAPI_PRIVATE_KEY or VAPI_PUBLIC_KEY in your environment.',
        });
      }

      const { business, industry, region } = req.body;

      if (!business || !industry) {
        return res.status(400).json({ error: 'Business and industry are required' });
      }

      console.log(`[PERSONALIZED ASSISTANT] Creating personalized script for ${business.name}`);

      // Generate personalized script based on business data
      const personalizedScript = generatePersonalizedScript(business, industry, region);

      const assistant = {
        name: `Personalized Assistant - ${business.name}`,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          maxTokens: 200,
        },
        voice: {
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          stability: 0.7,
          clarity: 0.85,
          style: 0.2,
        },
        firstMessage: personalizedScript.firstMessage,
        systemMessage: personalizedScript.systemMessage,
        maxDurationSeconds: 180,
        endCallMessage:
          "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
        endCallPhrases: ['not interested', 'not right now', 'call back later', 'send me information'],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
        backgroundSound: 'office',
      };

      // Create assistant via VAPI API
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistant),
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        return res.status(400).json({
          error: 'Failed to create personalized assistant',
          details: errorData,
        });
      }

      const assistantData = await vapiResponse.json();

      res.json({
        success: true,
        message: 'Personalized assistant created successfully',
        assistant: {
          id: assistantData.id,
          name: assistantData.name,
          personalizedScript: personalizedScript,
        },
      });
    } catch (error) {
      console.error('[PERSONALIZED ASSISTANT ERROR]', error);
      res.status(500).json({
        error: 'Failed to create personalized assistant',
        message: error.message,
      });
    }
  });

  return router;
}

