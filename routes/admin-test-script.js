import express from 'express';

export function createAdminTestScriptRouter() {
  const router = express.Router();

  router.post('/test-script', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { testType, businessData } = req.body;

      console.log(`[SCRIPT TEST] Testing ${testType} with business data`);

      let testResults = {};

      if (testType === 'opening_message') {
        const openingMessage =
          "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?";

        testResults = {
          openingMessage: openingMessage,
          analysis: {
            length: openingMessage.length,
            wordCount: openingMessage.split(' ').length,
            includesValueProposition: openingMessage.includes('300%'),
            includesPrice: openingMessage.includes('£500/month'),
            includesBenefit: openingMessage.includes('never miss another patient'),
            includesTimeCommitment: openingMessage.includes('2 minutes'),
            includesCompanyName: openingMessage.includes('AI Booking Solutions'),
            includesPersonalName: openingMessage.includes('Sarah')
          },
          recommendations: [
            openingMessage.length < 200
              ? '✅ Good length (under 200 characters)'
              : '⚠️ Consider shortening',
            openingMessage.includes('300%') ? '✅ Includes specific benefit' : '❌ Missing specific benefit',
            openingMessage.includes('£500/month') ? '✅ Includes price upfront' : '❌ Missing price',
            openingMessage.includes('never miss another patient')
              ? '✅ Includes pain point'
              : '❌ Missing pain point',
            openingMessage.includes('2 minutes')
              ? '✅ Includes time commitment'
              : '❌ Missing time commitment'
          ]
        };
      } else if (testType === 'objection_handling') {
        const objections = {
          too_expensive: {
            response:
              "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly",
            analysis: {
              acknowledgesConcern: true,
              providesROI: true,
              usesSpecificNumbers: true,
              addressesPainPoint: true
            }
          },
          too_busy: {
            response:
              "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager",
            analysis: {
              acknowledgesConcern: true,
              providesSolution: true,
              includesPremiumBenefit: true,
              addressesTimeIssue: true
            }
          },
          not_interested: {
            response:
              'I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?',
            analysis: {
              acknowledgesConcern: true,
              providesSocialProof: true,
              offersAlternative: true,
              maintainsProfessionalism: true
            }
          },
          budget_concerns: {
            response:
              "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?",
            analysis: {
              acknowledgesConcern: true,
              providesROI: true,
              usesSpecificNumbers: true,
              offersProof: true
            }
          }
        };

        testResults = {
          objections: objections,
          summary: {
            totalObjections: Object.keys(objections).length,
            averageResponseLength:
              Object.values(objections).reduce((sum, obj) => sum + obj.response.length, 0) /
              Object.keys(objections).length,
            allAcknowledgeConcerns: Object.values(objections).every(
              (obj) => obj.analysis.acknowledgesConcern
            ),
            allProvideSolutions: Object.values(objections).every(
              (obj) => obj.analysis.providesSolution || obj.analysis.providesROI
            )
          }
        };
      } else if (testType === 'personalization') {
        const businessName = businessData?.name || 'Test Practice';
        const decisionMaker = businessData?.decisionMaker?.name || 'there';
        const location = businessData?.address || 'your area';

        const personalizedOpening = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. I'm calling because we've helped practices in ${location} improve their appointment booking systems with our premium £500/month service. Do you have 90 seconds to hear how this could work for ${businessName}?`;

        testResults = {
          personalizedOpening: personalizedOpening,
          personalization: {
            usesDecisionMakerName: personalizedOpening.includes(decisionMaker),
            usesBusinessName: personalizedOpening.includes(businessName),
            usesLocation: personalizedOpening.includes(location),
            maintainsValueProposition: personalizedOpening.includes('300%'),
            maintainsPrice: personalizedOpening.includes('£500/month')
          },
          analysis: {
            length: personalizedOpening.length,
            wordCount: personalizedOpening.split(' ').length,
            personalizationScore:
              (personalizedOpening.includes(decisionMaker) ? 1 : 0) +
              (personalizedOpening.includes(businessName) ? 1 : 0) +
              (personalizedOpening.includes(location) ? 1 : 0)
          }
        };
      }

      res.json({
        success: true,
        message: `${testType} test completed`,
        testType: testType,
        results: testResults,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SCRIPT TEST ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Script test failed',
        error: error.message
      });
    }
  });

  return router;
}

