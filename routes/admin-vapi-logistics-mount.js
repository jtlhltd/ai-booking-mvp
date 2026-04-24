import { Router } from 'express';

export function createAdminVapiLogisticsRouter(deps) {
  const { getApiKey, runLogisticsOutreach } = deps || {};

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

  // CSV Import for Logistics Outreach
  router.post('/admin/vapi/logistics-csv-import', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { csvData, assistantId, tenantKey = 'logistics_client' } = req.body;

      if (!csvData || !assistantId) {
        return res.status(400).json({ error: 'csvData and assistantId are required' });
      }

      console.log('[LOGISTICS CSV IMPORT]', {
        assistantId,
        tenantKey,
        csvRows: csvData.length,
        requestedBy: req.ip,
      });

      // Parse CSV data into businesses array
      const businesses = csvData
        .map((row, index) => ({
          name:
            row['Business Name'] ||
            row['Company Name'] ||
            row['Name'] ||
            `Business ${index + 1}`,
          phone: row['Phone'] || row['Phone Number'] || row['Mobile'] || row['Contact Number'],
          address: row['Address'] || row['Location'] || row['City'] || '',
          website: row['Website'] || row['URL'] || '',
          decisionMaker: row['Decision Maker'] || row['Contact Person'] || row['Manager'] || '',
          email: row['Email'] || row['Email Address'] || '',
          industry: row['Industry'] || row['Sector'] || 'Logistics',
          source: 'CSV Import',
        }))
        .filter((business) => business.phone); // Only include businesses with phone numbers

      if (businesses.length === 0) {
        return res.status(400).json({ error: 'No valid businesses found in CSV (need phone numbers)' });
      }

      console.log(`[LOGISTICS CSV IMPORT] Parsed ${businesses.length} valid businesses`);

      // Now run the outreach
      const outreachResult = await runLogisticsOutreach({
        assistantId,
        businesses,
        tenantKey,
        vapiKey: process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY,
      });

      res.json({
        success: true,
        message: 'CSV import and outreach completed',
        tenantKey,
        totalBusinesses: businesses.length,
        validBusinesses: businesses.length,
        results: outreachResult,
      });
    } catch (error) {
      console.error('[LOGISTICS CSV IMPORT ERROR]', error);
      res.status(500).json({
        error: 'Failed to import CSV and run outreach',
        message: error.message,
      });
    }
  });

  // Automated Logistics Outreach - Batch calling with proper metadata
  router.post('/admin/vapi/logistics-outreach', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { assistantId, businesses, tenantKey = 'logistics_client' } = req.body;

      if (!assistantId || !businesses || !Array.isArray(businesses)) {
        return res.status(400).json({ error: 'assistantId and businesses array are required' });
      }

      console.log('[LOGISTICS OUTREACH]', {
        assistantId,
        businessCount: businesses.length,
        tenantKey,
        requestedBy: req.ip,
      });

      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          error: 'VAPI API key not configured',
          message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables',
        });
      }

      const results = [];
      const batchSize = 3; // Process 3 calls at a time

      for (let i = 0; i < businesses.length; i += batchSize) {
        const batch = businesses.slice(i, i + batchSize);

        const batchPromises = batch.map(async (business, index) => {
          try {
            // Add staggered delay within batch
            await new Promise((resolve) => setTimeout(resolve, index * 2000));

            const callData = {
              assistantId,
              customer: {
                number: business.phone,
                name: business.name || 'Business',
              },
              metadata: {
                tenantKey,
                leadPhone: business.phone,
                businessName: business.name,
                businessAddress: business.address,
                businessWebsite: business.website,
                decisionMaker: business.decisionMaker,
                callTime: new Date().toISOString(),
                priority: i + index + 1,
              },
            };

            const callResponse = await fetch('https://api.vapi.ai/call', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${vapiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(callData),
            });

            if (callResponse.ok) {
              const callResult = await callResponse.json();
              results.push({
                businessName: business.name,
                phone: business.phone,
                status: 'call_initiated',
                callId: callResult.id,
                priority: i + index + 1,
                message: 'Call initiated successfully',
              });

              console.log(`[LOGISTICS CALL] Initiated for ${business.name} (${business.phone})`);
            } else {
              const errorData = await callResponse.json();
              results.push({
                businessName: business.name,
                phone: business.phone,
                status: 'call_failed',
                error: errorData.message || 'Unknown error',
                message: 'Failed to initiate call',
              });

              console.error(`[LOGISTICS CALL ERROR] Failed to call ${business.name}:`, errorData);
            }
          } catch (error) {
            results.push({
              businessName: business.name,
              phone: business.phone,
              status: 'call_failed',
              error: error.message,
              message: 'Call failed due to error',
            });

            console.error(`[LOGISTICS CALL ERROR] Error calling ${business.name}:`, error.message);
          }
        });

        await Promise.all(batchPromises);

        // Delay between batches
        if (i + batchSize < businesses.length) {
          console.log(`[LOGISTICS OUTREACH] Batch ${Math.floor(i / batchSize) + 1} completed. Waiting 5s before next batch.`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      console.log(`[LOGISTICS OUTREACH] Completed. Results:`, results.length);

      res.json({
        success: true,
        message: 'Logistics outreach campaign completed',
        tenantKey,
        totalBusinesses: businesses.length,
        results,
      });
    } catch (error) {
      console.error('[LOGISTICS OUTREACH ERROR]', error);
      res.status(500).json({
        error: 'Failed to run logistics outreach',
        message: error.message,
      });
    }
  });

  // Create Logistics & Shipping Script Assistant (STRICT adherence)
  router.post('/admin/vapi/logistics-assistant', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      console.log('[LOGISTICS ASSISTANT CREATION REQUESTED]', {
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

      // Strict script for logistics & shipping assistant
      const firstMessage = 'Hi, Please can I speak with the person in charge of logistics and shipping?';

      const systemMessage = `You are a professional logistics and shipping cold call assistant. You MUST follow this script EXACTLY with 100% adherence, but speak naturally and conversationally. Do not improvise or deviate from the script flow.

SCRIPT FLOW:

RECEPTIONIST SCRIPT:
"Hi, Please can I speak with the person in charge of logistics and shipping?"

If they don't put you through to the correct person, get a name of who that is and add to your callbacks on sheets.

CORRECT PERSON SCRIPT:
It will either be a call back to the business where you ask for the persons name in charge of shipping because of your call with the receptionist or:

"Hi, Please can I speak with the person in charge of logistics and shipping?"

If they say "It's me" or similar:
"Great, I am a partner of UPS, FEDEX & DHL, we offer all these couriers on one online platform, I am just wondering if I can get an email across to you with some rates and services we can offer?"

If they say yes:
"Which is the best email to send to?"

"So that I can tailor this email to you a little bit more, do you send outside the UK at all?"

INTERNATIONAL QUESTIONS (ask these in order):
- "Who are your main couriers you use?"
- "How often is this?" (spell this out to them if they are saying it can be anything…'do you have parcels going out weekly? Or at least a couple a month?)
- "Do you have any main countries you send to and I will make sure I put some rates to these specific lanes on the email?"
- "You don't happen to have a last example of a shipment you sent to one of these countries you mentioned and what it cost (get the weight and dimensions if you can)?"

If you have ALL the above and rates, end the call. UNLESS they are super happy to talk, then move to Domestic. If they give you small info on the above, move onto Domestic to see if you can get more from this. If they don't do International, move straight to the Domestic Q's.

DOMESTIC QUESTIONS:
- "How often do you send around the UK? Is this daily or weekly?" (get the number of daily or weekly)
- "Who is your main courier for your UK parcels?"
- "Do you have a standard rate you pay up to a certain kg?"
- "Is that excluding fuel and VAT?"
- "Do you mainly send single parcels or multiple parcels to one address?"

ICE BREAKERS (use these naturally in the middle of your questions so it's not too formal):
- Moving from International to Domestic Questions: "Really appreciate the answers for your INTL, I will get some Domestic prices to you as well, just a couple more questions apologies on this…"
- "Really appreciate all of this information, just lastly can I confirm…"
- "Thanks for this, I know this has taken longer than expected, but this info just helps tailor this email as best as possible so we can ensure we are saving you money and keeping your service levels high"
- "Just the last question sorry…"
- "It does look like we can definitely help here, can I just please confirm a couple of things before I send this email…"
- "Really sorry to keep you, I do appreciate the time, can I quickly confirm a few last things…"

CALLBACK HANDLING:
If the receptionist says they need to call back later, use the schedule_callback tool to schedule it. Always get the receptionist's name and note the reason for callback.

STRICT RULES:
1. Follow the script EXACTLY - do not improvise
2. Use the exact wording provided but speak naturally
3. Ask questions in the specified order
4. Use ice breakers to keep conversation natural
5. If receptionist blocks, get their name and schedule callback
6. Always be professional and friendly
7. End calls appropriately based on responses
8. Use tools to access sheets and schedule callbacks when needed
9. Handle interruptions gracefully and steer back to the script
10. If they ask questions about your service, answer briefly and return to the script`;

      const assistant = {
        name: 'Logistics & Shipping Script Assistant',
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.1,
          maxTokens: 300,
        },
        voice: {
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          stability: 0.7,
          clarity: 0.85,
          style: 0.2,
          similarityBoost: 0.8,
        },
        firstMessage,
        systemMessage,
        maxDurationSeconds: 300,
        endCallMessage: 'Thank you for your time.',
        endCallPhrases: ['not interested', 'no', 'busy', 'call back later'],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
      };

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
        console.error('[VAPI ASSISTANT CREATION ERROR]', errorData);
        return res.status(400).json({
          error: 'Failed to create VAPI assistant',
          details: errorData,
        });
      }

      const assistantData = await vapiResponse.json();

      console.log('[LOGISTICS ASSISTANT CREATED]', {
        assistantId: assistantData.id,
        name: assistantData.name,
      });

      res.json({
        success: true,
        message: 'Logistics assistant created successfully',
        assistant: {
          id: assistantData.id,
          name: assistantData.name,
          status: assistantData.status,
          createdAt: assistantData.createdAt,
        },
      });
    } catch (error) {
      console.error('[LOGISTICS ASSISTANT CREATION ERROR]', error);
      res.status(500).json({
        error: 'Failed to create logistics assistant',
        message: error.message,
      });
    }
  });

  return router;
}

