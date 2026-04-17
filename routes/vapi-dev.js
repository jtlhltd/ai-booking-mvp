import express from 'express';

export function createVapiDevRouter() {
  const router = express.Router();

  // Simple VAPI Test Route (No API Key Required)
  router.get('/test-vapi', async (_req, res) => {
    try {
      const vapiKey =
        process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

      if (!vapiKey) {
        return res.json({
          success: false,
          message: 'VAPI API key not found',
          availableKeys: {
            VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
            VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
            VAPI_API_KEY: !!process.env.VAPI_API_KEY
          }
        });
      }

      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (vapiResponse.ok) {
        const assistants = await vapiResponse.json();
        res.json({
          success: true,
          message: 'VAPI connection successful!',
          assistantsCount: assistants.length,
          assistantId: 'dd67a51c-7485-4b62-930a-4a84f328a1c9'
        });
      } else {
        const errorData = await vapiResponse.json();
        res.json({
          success: false,
          message: 'VAPI API call failed',
          error: errorData
        });
      }
    } catch (error) {
      res.json({
        success: false,
        message: 'VAPI test failed',
        error: error.message
      });
    }
  });

  // Quick Assistant Creation Route (No API Key Required)
  router.get('/create-assistant', async (_req, res) => {
    try {
      console.log('[QUICK ASSISTANT CREATION] Creating cold call assistant');

      const vapiKey =
        process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          error: 'VAPI API key not configured',
          message:
            'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
        });
      }

      const coldCallAssistant = {
        name: 'Dental Cold Call Bot - £500/mo',
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.3,
          maxTokens: 200
        },
        voice: {
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          stability: 0.7,
          clarity: 0.85,
          style: 0.2,
          similarityBoost: 0.8
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
        maxDurationSeconds: 180,
        endCallMessage:
          "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
        endCallPhrases: ['not interested', 'not right now', 'call back later', 'send me information'],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
        backgroundSound: 'office',
        silenceTimeoutSeconds: 10,
        responseDelaySeconds: 1,
        llmRequestDelaySeconds: 0.1
      };

      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(coldCallAssistant)
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        return res.status(400).json({
          error: 'Failed to create VAPI assistant',
          details: errorData
        });
      }

      const assistantData = await vapiResponse.json();

      res.json({
        success: true,
        message: 'Cold call assistant created successfully!',
        assistant: {
          id: assistantData.id,
          name: assistantData.name,
          status: assistantData.status,
          createdAt: assistantData.createdAt
        },
        nextSteps: [
          'Visit /vapi-test-dashboard to test the assistant',
          'Use the assistant ID to make test calls',
          'Start calling real businesses from UK business search'
        ]
      });
    } catch (error) {
      console.error('[QUICK ASSISTANT CREATION ERROR]', error);
      res.status(500).json({
        error: 'Failed to create cold call assistant',
        message: error.message
      });
    }
  });

  return router;
}

