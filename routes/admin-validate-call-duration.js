import express from 'express';

export function createAdminValidateCallDurationRouter() {
  const router = express.Router();

  router.get('/validate-call-duration', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('[CALL DURATION VALIDATION] Validating call duration settings');

      const assistantConfig = {
        maxDurationSeconds: 180,
        systemMessage:
          "You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.",
        endCallPhrases: ['not interested', 'not right now', 'call back later'],
        endCallMessage:
          "Thank you for your time. I'll send you some information about our premium service. Have a great day!"
      };

      const conversationFlow = {
        rapportBuilding: {
          duration: 15,
          description: 'Hi [Name], this is Sarah from AI Booking Solutions'
        },
        qualification: { duration: 30, description: 'Are you the owner or manager?' },
        painAmplification: { duration: 30, description: "What's your biggest challenge?" },
        valuePresentation: { duration: 45, description: 'We help practices increase bookings by 300%' },
        objectionHandling: { duration: 30, description: 'I understand your concerns...' },
        closing: { duration: 30, description: 'Would you be available for a demo?' }
      };

      const totalFlowDuration = Object.values(conversationFlow).reduce(
        (sum, step) => sum + step.duration,
        0
      );

      const validation = {
        assistantConfig: assistantConfig,
        conversationFlow: conversationFlow,
        analysis: {
          maxDurationSeconds: assistantConfig.maxDurationSeconds,
          maxDurationMinutes: assistantConfig.maxDurationSeconds / 60,
          totalFlowDuration: totalFlowDuration,
          totalFlowMinutes: totalFlowDuration / 60,
          withinOptimalRange: totalFlowDuration <= 180,
          hasEndCallPhrases: assistantConfig.endCallPhrases.length > 0,
          hasEndCallMessage: !!assistantConfig.endCallMessage,
          includesTimeGuidance: assistantConfig.systemMessage.includes('under 2 minutes')
        },
        recommendations: [
          assistantConfig.maxDurationSeconds <= 180
            ? '✅ Max duration set to 3 minutes (optimal)'
            : '⚠️ Consider reducing max duration to 3 minutes',
          totalFlowDuration <= 180
            ? '✅ Conversation flow fits within time limit'
            : '⚠️ Conversation flow exceeds time limit',
          assistantConfig.endCallPhrases.length > 0
            ? '✅ End call phrases configured'
            : '❌ Missing end call phrases',
          assistantConfig.endCallMessage
            ? '✅ End call message configured'
            : '❌ Missing end call message',
          assistantConfig.systemMessage.includes('under 2 minutes')
            ? '✅ Time guidance included'
            : '❌ Missing time guidance in system message'
        ],
        optimalTiming: {
          targetDuration: '2-3 minutes',
          maxDuration: '3 minutes',
          conversationSteps: Object.entries(conversationFlow).map(([step, config]) => ({
            step: step,
            duration: `${config.duration}s`,
            description: config.description
          }))
        }
      };

      res.json({
        success: true,
        message: 'Call duration validation completed',
        validation: validation,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CALL DURATION VALIDATION ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Call duration validation failed',
        error: error.message
      });
    }
  });

  return router;
}

