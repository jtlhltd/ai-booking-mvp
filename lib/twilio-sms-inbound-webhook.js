/**
 * Twilio inbound SMS webhook — logic extracted from server.js for testing and reuse.
 * Pass all server-side collaborators via `deps` (no import-time side effects).
 */
export async function handleTwilioSmsInbound(req, res, deps) {
  const {
    validatePhoneNumber,
    validateSmsBody,
    normalizePhoneE164,
    resolveTenantKeyFromInbound,
    listFullClients,
    getFullClient,
    upsertFullClient,
    nanoid,
    trackConversionStage,
    trackAnalyticsEvent,
    VAPI_PRIVATE_KEY,
    VAPI_TEST_MODE,
    VAPI_DRY_RUN,
    checkBudgetBeforeCall,
    handleVapiFailure,
    determineCallScheduling,
    addToCallQueue,
    isBusinessHours,
    getNextBusinessHour,
    calculateLeadScore,
    getLeadPriority,
    smsConfig,
    TIMEZONE,
    selectOptimalAssistant,
    retryWithBackoff,
    generateAssistantVariables,
    VAPI_URL,
    recordPerformanceMetric,
    pickCalendarId,
    GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    GOOGLE_PRIVATE_KEY_B64,
    google,
  } = deps || {};

  try {
    const rawFrom = (req.body.From || '').toString();
    const rawTo   = (req.body.To   || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    // Input validation
    if (!validatePhoneNumber(rawFrom)) {
      console.log('[INVALID INPUT]', { field: 'From', reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validatePhoneNumber(rawTo)) {
      console.log('[INVALID INPUT]', { field: 'To', reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validateSmsBody(bodyTxt)) {
      console.log('[INVALID INPUT]', { field: 'Body', reason: 'invalid_body', bodyChars: bodyTxt.length });
      return res.status(400).send('Invalid message body');
    }

    // Normalize numbers: strip spaces so E.164 comparisons work
    const from = normalizePhoneE164(rawFrom);
    const to   = normalizePhoneE164(rawTo);

    const redactE164 = (e) => {
      const s = e && String(e);
      if (!s || s.length < 5) return '***';
      return `…${s.slice(-4)}`;
    };
    // Avoid logging full numbers or message content (PII).
    console.log('[INBOUND SMS]', { from: redactE164(from), to: redactE164(to), bodyChars: bodyTxt.length });
    
    // Analytics logging
    console.log('[SMS_ANALYTICS]', {
      timestamp: new Date().toISOString(),
      from: redactE164(from),
      to: redactE164(to),
      bodyLength: bodyTxt.length,
      messageType: bodyTxt.toUpperCase(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'unknown'
    });
  // --- derive tenantKey from header, inbound 'To', or MessagingServiceSid ---
  const headerKey = req.get('X-Client-Key');
  const toE164 = normalizePhoneE164(req.body.To, 'GB');
  const mss = req.body.MessagingServiceSid || req.body.messagingServiceSid?.trim?.();
  let tenantKey = headerKey || await resolveTenantKeyFromInbound({ to: toE164, messagingServiceSid: mss });

  console.log('[TENANT KEY RESOLVED]', { 
    tenantKey, 
    headerKey, 
    toE164, 
    messagingServiceSid: mss,
    resolved: !!tenantKey
  });

  if (!tenantKey) {
    console.log('[TENANT RESOLVE FAIL]', { to: req.body.To, toE164, messagingServiceSid: mss });
    return res.send('OK');
  }


    // Validate sender
    if (!from) return res.type('text/plain').send('IGNORED');

    // YES / STOP intents (extend as needed)
    const isYes  = /^\s*(yes|y|ok|okay|sure|confirm)\s*$/i.test(bodyTxt);
    const isStart = /^\s*(start|unstop)\s*$/i.test(bodyTxt);
    const isStop = /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i.test(bodyTxt);

    // Load & update the most recent lead matching this phone from database
    const clients = await listFullClients();
    const leads = clients.flatMap(client => client.leads || []);
    const revIdx = [...leads].reverse().findIndex(L => normalizePhoneE164(L.phone || '') === from);
    const idx = revIdx >= 0 ? (leads.length - 1 - revIdx) : -1;

    let serviceForCall = '';

    if (idx >= 0) {
      const prev = leads[idx];
      const now = new Date().toISOString();
      tenantKey = prev.tenantKey || tenantKey; // Preserve existing tenantKey or use resolved one
      serviceForCall = prev.service || '';
      leads[idx] = {
        ...prev,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: isStop ? false : ((isYes || isStart) ? true : (prev.consentSms ?? false)),
        status: isStop ? 'opted_out' : (isYes ? 'engaged' : (prev.status || 'new')),
        updatedAt: now,
      };
    } else {
      // Create a minimal lead if unknown number texts in
      const now = new Date().toISOString();
      const newLead = {
        id: 'lead_' + nanoid(8),
        phone: from,
        tenantKey: tenantKey,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: (isYes || isStart) ? true : false,
        status: isYes ? 'engaged' : 'new',
        createdAt: now,
        updatedAt: now,
      };
      
      console.log('[LEAD CREATED]', { 
        phone: from, 
        tenantKey, 
        body: bodyTxt, 
        consentSms: newLead.consentSms,
        status: newLead.status
      });
      leads.push(newLead);
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'lead_created',
        stageData: {
          service: serviceForCall,
          score: newLead.score || 0,
          source: 'sms_opt_in',
          consentSms: newLead.consentSms,
          status: newLead.status
        }
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: isYes ? 'yes_response' : 'start_opt_in',
        eventCategory: 'lead_interaction',
        eventData: {
          phone: from,
          service: serviceForCall,
          score: newLead.score || 0,
          existingLead: false
        },
        sessionId: `sms_${from}_${Date.now()}`,
        userAgent: 'SMS',
        ipAddress: req.ip
      });
    }

    // Save leads to database by updating the client
    if (tenantKey) {
      const client = await getFullClient(tenantKey);
      if (client) {
        client.leads = leads.filter(lead => lead.tenantKey === tenantKey);
        client.updatedAt = new Date().toISOString();
        await upsertFullClient(client);
      }
    }

    // Check if already opted in (idempotent) - but allow VAPI calls for YES/START messages
    const existingLead = leads.find(l => l.phone === from);
    if (existingLead && existingLead.consentSms && existingLead.status === 'engaged' && !(isYes || isStart)) {
      console.log('[IDEMPOTENT SKIP]', { from, tenantKey, reason: 'already_opted_in' });
      return res.send('OK');
    }

    // If user texted YES or START && we know the tenant, trigger a Vapi call right away (fire-and-forget)
    console.log('[VAPI CONDITION CHECK]', { 
      isYes, 
      isStart, 
      tenantKey, 
      hasVapiKey: !!VAPI_PRIVATE_KEY,
      condition: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Debug: Check if tenantKey is still available
    console.log('[TENANT KEY DEBUG]', { 
      tenantKey, 
      isYes, 
      isStart, 
      willTriggerVapi: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Prevent calls to assistant's own number or invalid numbers
    const isAssistantNumber = from === '+447403934440'; // Assistant's number - don't call this
    const isValidCustomerNumber = from && from.length > 10 && !from.includes('000000');
    
    console.log('[VAPI NUMBER VALIDATION]', { 
      from, 
      isAssistantNumber, 
      isValidCustomerNumber,
      willCall: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber
    });
    
    if ((isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber) {
      // VAPI Token Protection - prevent unnecessary calls during testing
      console.log('[VAPI DEBUG]', { 
        VAPI_TEST_MODE, 
        VAPI_DRY_RUN, 
        NODE_ENV: process.env.NODE_ENV,
        VAPI_PRIVATE_KEY: VAPI_PRIVATE_KEY ? 'present' : 'missing'
      });
      
      if (VAPI_TEST_MODE || VAPI_DRY_RUN) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: VAPI_TEST_MODE ? 'test_mode' : 'dry_run',
          wouldHaveCalled: true 
        });
        return res.send('OK');
      }

      // Check budget before making call
      const budgetCheck = await checkBudgetBeforeCall(tenantKey, 0.05); // Estimated $0.05 per call
      if (!budgetCheck.allowed) {
        console.log('[BUDGET BLOCKED CALL]', {
          tenantKey,
          from,
          reason: budgetCheck.reason,
          budget: budgetCheck.budget
        });
        
        // Send SMS fallback instead of making call
        await handleVapiFailure({
          tenantKey,
          from,
          error: new Error(`Budget exceeded: ${budgetCheck.reason}`),
          errorType: 'budget_exceeded',
          existingLead
        });
        
        return res.send('OK');
      }
      
      // Intelligent call scheduling
      const callScheduling = await determineCallScheduling({ tenantKey, from, isYes, isStart, existingLead });
      if (callScheduling.shouldDelay) {
        console.log('[CALL SCHEDULED]', {
          tenantKey,
          from,
          reason: callScheduling.reason,
          scheduledFor: callScheduling.scheduledFor,
          priority: callScheduling.priority
        });
        
        // Add to call queue
        await addToCallQueue({
          clientKey: tenantKey,
          leadPhone: from,
          priority: callScheduling.priority || 5,
          scheduledFor: callScheduling.scheduledFor,
          callType: 'vapi_call',
          callData: {
            triggerType: isYes ? 'yes_response' : 'start_opt_in',
            leadScore: existingLead?.score || 0,
            leadStatus: existingLead?.status || 'new',
            businessHours: isBusinessHours(client) ? 'within' : 'outside'
          }
        });
        
        return res.send('OK');
      }

      // Check business hours and lead score before making calls
      const client = await getFullClient(tenantKey);
      const isBusinessTime = isBusinessHours(client);
      
      // Calculate lead score
      const leadScore = calculateLeadScore(existingLead, client);
      const priority = getLeadPriority(leadScore);
      
      console.log('[LEAD SCORE]', { 
        from, 
        tenantKey, 
        score: leadScore, 
        priority,
        isBusinessTime,
        willCall: isBusinessTime && leadScore >= 40 // Only call high/medium priority leads
      });
      
      // Skip very low priority leads even during business hours
      if (leadScore < 40) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: 'low_lead_score',
          score: leadScore,
          priority
        });
        return res.send('OK');
      }
      
      if (!isBusinessTime) {
        const nextBusiness = getNextBusinessHour(client);
        console.log('[AUTO-CALL DEFERRED]', { 
          tenantKey, 
          from, 
          reason: 'outside_business_hours',
          nextBusinessTime: nextBusiness.toISOString(),
          currentTime: new Date().toISOString()
        });
        
        // Send a message explaining the delay
        try {
          const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
          if (configured) {
            const brand = client?.displayName || client?.clientKey || 'Our Clinic';
            const nextBusinessStr = nextBusiness.toLocaleString('en-GB', { 
              timeZone: client?.booking?.timezone || TIMEZONE,
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit'
            });
            const ack = `Thanks! ${brand} will call you during business hours (${nextBusinessStr}). Reply STOP to opt out.`;
            await smsClient.messages.create({
              from: fromNumber,
              to: from,
              body: ack,
              messagingServiceSid
            });
            console.log('[BUSINESS HOURS SMS]', { from, to: from, brand, nextBusinessTime: nextBusinessStr });
          }
        } catch (e) {
          console.error('[BUSINESS HOURS SMS ERROR]', e?.message || String(e));
        }
        
        return res.send('OK');
      }
      
      // If we're blocking the call, send a message explaining why
      if (isAssistantNumber) {
        console.log('[VAPI BLOCKED]', { from, reason: 'assistant_number' });
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} will call you shortly. Reply STOP to opt out.`;
              await smsClient.messages.create({
                from: fromNumber,
                to: from,
                body: ack,
                messagingServiceSid
              });
              console.log('[YES ACK SMS]', { from, to: from, brand });
            }
          }
        } catch (e) {
          console.error('[YES ACK SMS ERROR]', e?.message || String(e));
        }
        return res.send('OK');
      }
      
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
          // Dynamic assistant selection based on lead characteristics
          const assistantConfig = await selectOptimalAssistant({ client, existingLead, isYes, isStart });
          const assistantId = assistantConfig.assistantId;
          const phoneNumberId = assistantConfig.phoneNumberId;
          if (isStart) {
            console.log('[LEAD OPT-IN START]', { from, tenantKey });
          }
          const payload = {
            assistantId,
            phoneNumberId,
            customer: { number: from, numberE164CheckEnabled: true },
            maxDurationSeconds: 10, // VAPI minimum is 10 seconds - still much cheaper than 10 minutes
            metadata: {
              tenantKey,
              leadPhone: from,
              triggerType: isYes ? 'yes_response' : 'start_opt_in',
              timestamp: new Date().toISOString(),
              leadScore: existingLead?.score || 0,
              leadStatus: existingLead?.status || 'new',
              businessHours: isBusinessHours(client) ? 'within' : 'outside',
              retryAttempt: 0 // Track retry attempts
            },
            assistantOverrides: {
              variableValues: await generateAssistantVariables({
                client,
                existingLead,
                tenantKey,
                serviceForCall,
                isYes,
                isStart,
                assistantConfig
              })
            }
          };
            // Use enhanced retry logic for VAPI calls
            const vapiResult = await retryWithBackoff(async () => {
          const resp = await fetch(`${VAPI_URL}/call`, {
            method: 'POST',
                headers: { 
                  'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 
                  'Content-Type': 'application/json',
                  'User-Agent': 'AI-Booking-System/1.0'
                },
                body: JSON.stringify(payload),
                timeout: 30000 // 30 second timeout
              });
              
              if (!resp.ok) {
                const errorText = await resp.text().catch(() => resp.statusText);
                const error = new Error(`VAPI call failed: ${resp.status} ${errorText}`);
                error.status = resp.status;
                throw error;
              }
              
              const result = await resp.json().catch(() => null);
              if (!result) {
                throw new Error('Failed to parse VAPI response');
              }
              
              return result;
            }, 3, 2000, {
              operation: 'vapi_call',
              tenantKey,
              leadPhone: from
            }); // 3 retries, 2 second base delay with context

      console.log('[VAPI CALL SUCCESS]', { 
        from, 
        tenantKey, 
        callId: vapiResult?.id || 'unknown',
        status: vapiResult?.status || 'unknown',
        vapiStatus: 'ok' 
      });
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'vapi_call_initiated',
        stageData: {
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        previousStage: 'lead_created'
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: 'vapi_call_initiated',
        eventCategory: 'call_interaction',
        eventData: {
          phone: from,
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        sessionId: `vapi_${from}_${Date.now()}`,
        userAgent: 'VAPI',
        ipAddress: req.ip
      });
      
      // Record performance metric
      await recordPerformanceMetric({
        clientKey: tenantKey,
        metricName: 'vapi_call_initiated',
        metricValue: 1,
        metricUnit: 'count',
        metricCategory: 'call_metrics',
        metadata: {
          phone: from,
          callId: vapiResult?.id,
          triggerType: isYes ? 'yes_response' : 'start_opt_in'
        }
      });
          
          if (vapiResult) {
            const callId = vapiResult?.id || 'unknown';
            console.log('[AUTO-CALL TRIGGER]', { from, tenantKey, callId });
            
            // Book calendar appointment after successful VAPI call
            try {
              const calendarId = pickCalendarId(client);
              if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
                // Handle private key formatting - ensure it's properly formatted
                let privateKey = GOOGLE_PRIVATE_KEY;
                if (!privateKey && GOOGLE_PRIVATE_KEY_B64) {
                  privateKey = Buffer.from(GOOGLE_PRIVATE_KEY_B64, 'base64').toString();
                }
                
                // Ensure private key has proper line breaks
                if (privateKey && !privateKey.includes('\n')) {
                  privateKey = privateKey.replace(/\\n/g, '\n');
                }
                
                const auth = new google.auth.GoogleAuth({
                  credentials: {
                    client_email: GOOGLE_CLIENT_EMAIL,
                    private_key: privateKey,
                  },
                  scopes: ['https://www.googleapis.com/auth/calendar'],
                });
                
                const cal = google.calendar({ version: 'v3', auth });
                const now = new Date();
                const startTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
                const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes duration
                
                const event = {
                  summary: `AI Booking Call - ${client?.displayName || client?.clientKey}`,
                  description: `Automated follow-up call with ${from}\nCall ID: ${callId}\nTenant: ${tenantKey}`,
                  start: {
                    dateTime: startTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  end: {
                    dateTime: endTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  attendees: [], // Removed to avoid Google Calendar service account limitations
                  reminders: {
                    useDefault: false,
                    overrides: [
                      { method: 'popup', minutes: 10 },
                    ],
                  },
                };
                
                const createdEvent = await cal.events.insert({
                  calendarId,
                  resource: event,
                });
                
                console.log('[CALENDAR BOOKED]', { 
                  from, 
                  tenantKey, 
                  callId, 
                  eventId: createdEvent.data.id,
                  startTime: startTime.toISOString(),
                  calendarLink: createdEvent.data.htmlLink
                });
              }
            } catch (calendarError) {
              console.error('[CALENDAR BOOKING ERROR]', { 
                from, 
                tenantKey, 
                callId, 
                error: calendarError?.message || String(calendarError),
                errorType: calendarError?.name || 'Unknown',
                stack: calendarError?.stack?.substring(0, 200) // First 200 chars of stack trace
              });
              
              // Don't fail the entire process if calendar booking fails
              // The VAPI call was successful, calendar is just a nice-to-have
            }
          }
          
            if (!vapiResult || vapiResult.error) {
              console.error('[VAPI ERROR]', { 
                from,
                tenantKey,
                error: vapiResult?.error || 'VAPI call failed',
                payload: { 
                  assistantId, 
                  phoneNumberId, 
                  customerNumber: from,
                  maxDurationSeconds: 10
                }
              });
              
              // Implement fallback mechanism
              await handleVapiFailure({ from, tenantKey, error: vapiResult?.error || 'VAPI call failed' });
            }
          try {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} is calling you now. Reply STOP to opt out.`;
              const payload = { to: from, body: ack };
              if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
              await smsClient.messages.create(payload);
            }
          } catch (e) { console.log('[YES ACK SMS ERROR]', e?.message || String(e)); }
        } else {
          console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'client_not_found' });
        }
      } catch (err) {
        console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'error', error: (err?.message || String(err)) });
      }
    }

    return res.type('text/plain').send('OK');
  } catch (e) {
    console.error('[inbound.error]', e?.message || e);
    return res.type('text/plain').send('OK');
  }
}
