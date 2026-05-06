import { createCallWithKey as vapiCreateCallWithKey } from './vapi.js';

export async function runLogisticsOutreach({ assistantId, businesses, tenantKey, vapiKey }) {
  if (!vapiKey) {
    throw new Error('VAPI API key not configured');
  }

  const results = [];
  const batchSize = 3;

  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);

    const batchPromises = batch.map(async (business, index) => {
      try {
        await new Promise((resolve) => setTimeout(resolve, index * 2000));

        const callData = {
          assistantId,
          customer: {
            number: business.phone,
            name: business.name || 'Business'
          },
          metadata: {
            tenantKey,
            leadPhone: business.phone,
            businessName: business.name,
            businessAddress: business.address,
            businessWebsite: business.website,
            decisionMaker: business.decisionMaker,
            callTime: new Date().toISOString(),
            priority: i + index + 1
          }
        };

        try {
          const callResult = await vapiCreateCallWithKey({ vapiKey, callData });
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_initiated',
            callId: callResult.id,
            priority: i + index + 1,
            message: 'Call initiated successfully'
          });

          console.log(`[LOGISTICS CALL] Initiated for ${business.name} (${business.phone})`);
        } catch (error) {
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: error?.vapi?.message || error?.message || 'Unknown error',
            message: 'Failed to initiate call'
          });

          console.error(`[LOGISTICS CALL ERROR] Failed to call ${business.name}:`, error?.vapi || error);
        }
      } catch (error) {
        results.push({
          businessName: business.name,
          phone: business.phone,
          status: 'call_failed',
          error: error.message,
          message: 'Call failed due to error'
        });

        console.error(`[LOGISTICS CALL ERROR] Error calling ${business.name}:`, error.message);
      }
    });

    await Promise.all(batchPromises);

    if (i + batchSize < businesses.length) {
      console.log(
        `[LOGISTICS OUTREACH] Batch ${Math.floor(i / batchSize) + 1} completed. Waiting 5s before next batch.`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  return results;
}

export async function startColdCallCampaign(campaign) {
  const results = [];
  const vapiKey = campaign?.vapiKey;
  if (!vapiKey) {
    console.error('[COLD CALL CAMPAIGN ERROR] Missing campaign.vapiKey');
    return results;
  }

  try {
    console.log(
      `[COLD CALL CAMPAIGN] Starting optimized campaign ${campaign.id} with ${campaign.businesses.length} businesses`
    );

    const prioritizedBusinesses = campaign.businesses.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      if (a.decisionMaker?.name) scoreA += 10;
      if (b.decisionMaker?.name) scoreB += 10;

      if (a.website) scoreA += 5;
      if (b.website) scoreB += 5;

      if (a.email) scoreA += 3;
      if (b.email) scoreB += 3;

      return scoreB - scoreA;
    });

    const batchSize = 3;
    for (let i = 0; i < prioritizedBusinesses.length; i += batchSize) {
      const batch = prioritizedBusinesses.slice(i, i + batchSize);

      const batchPromises = batch.map(async (business, index) => {
        try {
          await new Promise((resolve) => setTimeout(resolve, index * 1000));

          const callData = {
            assistantId: campaign.assistantId,
            customer: {
              number: business.phone,
              name: business.decisionMaker?.name || business.name
            },
            metadata: {
              businessId: business.id,
              businessName: business.name,
              businessAddress: business.address,
              businessWebsite: business.website,
              businessEmail: business.email,
              decisionMaker: business.decisionMaker,
              campaignId: campaign.id,
              priority: i + index + 1,
              callTime: new Date().toISOString()
            },
            context: {
              practiceName: business.name,
              location: business.address,
              decisionMakerName: business.decisionMaker?.name,
              decisionMakerRole: business.decisionMaker?.role,
              website: business.website
            }
          };

          try {
            const callRes = await vapiCreateCallWithKey({ vapiKey, callData });
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              decisionMaker: business.decisionMaker,
              status: 'call_initiated',
              callId: callRes.id,
              priority: i + index + 1,
              message: 'Call initiated successfully',
              timestamp: new Date().toISOString()
            });

            console.log(
              `[COLD CALL] Call initiated for ${business.name} (${business.phone}) - Priority: ${i + index + 1}`
            );
          } catch (error) {
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              status: 'call_failed',
              error: error?.vapi?.message || error?.message || 'Unknown error',
              message: 'Failed to initiate call',
              timestamp: new Date().toISOString()
            });

            console.error(`[COLD CALL ERROR] Failed to call ${business.name}:`, error?.vapi || error);
          }
        } catch (error) {
          results.push({
            businessId: business.id,
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: error.message,
            message: 'Call failed due to error',
            timestamp: new Date().toISOString()
          });

          console.error(`[COLD CALL ERROR] Error calling ${business.name}:`, error.message);
        }
      });

      await Promise.all(batchPromises);

      const successRate = results.filter((r) => r.status === 'call_initiated').length / results.length;
      const delay = successRate > 0.8 ? 3000 : 5000;

      if (i + batchSize < prioritizedBusinesses.length) {
        console.log(
          `[COLD CALL CAMPAIGN] Batch ${Math.floor(i / batchSize) + 1} completed. Success rate: ${(successRate * 100).toFixed(1)}%. Waiting ${delay}ms before next batch.`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log(`[COLD CALL CAMPAIGN] Completed optimized campaign ${campaign.id}. Results:`, results.length);
  } catch (error) {
    console.error(`[COLD CALL CAMPAIGN ERROR]`, error.message);
  }

  return results;
}
