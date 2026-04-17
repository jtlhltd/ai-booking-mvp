import express from 'express';

export function createAdminTestLeadDataRouter() {
  const router = express.Router();

  router.get('/test-lead-data', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('[LEAD DATA TEST] Testing business search and decision maker research');

      const testQuery = {
        query: 'dentist',
        industry: 'dentist',
        location: 'London',
        contactInfo: true,
        limit: 5
      };

      const { generateUKBusinesses } = await import('../src/enhanced-business-search.js');
      const businesses = generateUKBusinesses(testQuery);

      if (businesses.length > 0) {
        const testBusiness = businesses[0];

        const { RealDecisionMakerContactFinder } = await import(
          '../src/real-decision-maker-contact-finder.js'
        );
        const contactFinder = new RealDecisionMakerContactFinder();

        try {
          const contacts = await contactFinder.findDecisionMakerContacts(testBusiness);

          res.json({
            success: true,
            message: 'Lead data quality test completed',
            testResults: {
              businessSearch: {
                totalBusinesses: businesses.length,
                sampleBusiness: {
                  name: testBusiness.name,
                  phone: testBusiness.phone,
                  email: testBusiness.email,
                  address: testBusiness.address,
                  website: testBusiness.website,
                  hasDecisionMaker: !!testBusiness.decisionMaker
                }
              },
              decisionMakerResearch: {
                contactsFound:
                  contacts.primary.length + contacts.secondary.length + contacts.gatekeeper.length,
                primaryContacts: contacts.primary.length,
                secondaryContacts: contacts.secondary.length,
                gatekeeperContacts: contacts.gatekeeper.length,
                sampleContact: contacts.primary[0] || contacts.secondary[0] || contacts.gatekeeper[0]
              },
              dataQuality: {
                phoneNumbersValid: businesses.filter((b) => b.phone && b.phone.startsWith('+44'))
                  .length,
                emailsValid: businesses.filter((b) => b.email && b.email.includes('@')).length,
                websitesValid: businesses.filter((b) => b.website && b.website.startsWith('http'))
                  .length,
                addressesValid: businesses.filter((b) => b.address && b.address.length > 10).length
              }
            }
          });
        } catch (contactError) {
          res.json({
            success: true,
            message: 'Lead data quality test completed (decision maker research failed)',
            testResults: {
              businessSearch: {
                totalBusinesses: businesses.length,
                sampleBusiness: {
                  name: testBusiness.name,
                  phone: testBusiness.phone,
                  email: testBusiness.email,
                  address: testBusiness.address,
                  website: testBusiness.website
                }
              },
              decisionMakerResearch: {
                error: contactError.message,
                status: 'failed'
              },
              dataQuality: {
                phoneNumbersValid: businesses.filter((b) => b.phone && b.phone.startsWith('+44'))
                  .length,
                emailsValid: businesses.filter((b) => b.email && b.email.includes('@')).length,
                websitesValid: businesses.filter((b) => b.website && b.website.startsWith('http'))
                  .length,
                addressesValid: businesses.filter((b) => b.address && b.address.length > 10).length
              }
            }
          });
        }
      } else {
        res.json({
          success: false,
          message: 'No businesses found in test',
          testResults: {
            businessSearch: { totalBusinesses: 0 },
            error: 'Business search returned no results'
          }
        });
      }
    } catch (error) {
      console.error('[LEAD DATA TEST ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Lead data quality test failed',
        error: error.message
      });
    }
  });

  return router;
}

