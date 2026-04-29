import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import { normalizePhoneE164 } from './utils.js';
import { parseStartPreference } from './start-preference.js';
import { getDemoOverrides, formatOverridesForTelemetry } from './demo-script.js';
import { recordDemoTelemetry } from './demo-telemetry.js';
import { phoneMatchKey } from './lead-phone-key.js';
import { makeJwtAuth, insertEvent } from '../gcal.js';

/**
 * POST /api/calendar/check-book — extracted from server.js for unit testing.
 */
export async function handleCalendarCheckBook(req, res, deps) {
  const requestStartedAt = Date.now();
  const {
    getClientFromHeader,
    deriveIdemKey,
    getMostRecentCallContext,
    pickTimezone,
    pickCalendarId,
    isDemoClient,
    smsConfig,
    renderTemplate,
    readJson,
    writeJson,
    CALLS_PATH,
    withRetry,
    setCachedIdem,
    getGoogleCredentials,
    getTwilioDemoContext
  } = deps;
  console.log('🚨🚨🚨 [v3-LEAD-FIX] HANDLER CALLED - lead variable fix deployed');

  // Enhanced idempotency handling using new library
  const client = await getClientFromHeader(req);
  const clientKey = client?.key || client?.tenantKey || 'default';
  
  let idemKey;
  try {
    const { generateIdempotencyKey, checkIdempotency, recordIdempotency } = await import('./idempotency.js');
    idemKey = generateIdempotencyKey(clientKey, 'booking', req.body);
    
    // Check for duplicate request
    const duplicateCheck = await checkIdempotency(clientKey, 'booking', idemKey, 5 * 60 * 1000); // 5 minute window
    if (duplicateCheck.isDuplicate) {
      console.log('[BOOKING] Duplicate request detected:', duplicateCheck.message);
      return res.status(409).json({
        ok: false,
        error: 'Duplicate request',
        message: duplicateCheck.message,
        timeSinceOriginal: duplicateCheck.timeSinceOriginal
      });
    }
  } catch (idemError) {
    console.warn('[BOOKING] Idempotency check failed, continuing:', idemError.message);
    // Fallback to old method if new library fails
    idemKey = deriveIdemKey(req);
  }

  try {
    console.log('[BOOKING] Request received:', new Date().toISOString());
    const {
      clientEmail: GOOGLE_CLIENT_EMAIL,
      privateKey: GOOGLE_PRIVATE_KEY,
      privateKeyB64: GOOGLE_PRIVATE_KEY_B64,
      calendarId: GOOGLE_CALENDAR_ID
    } = getGoogleCredentials();
    const {
      defaultSmsClient,
      TWILIO_FROM_NUMBER,
      TWILIO_MESSAGING_SERVICE_SID
    } = getTwilioDemoContext();
    
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ error: 'Unknown tenant' });
    
    console.log('[BOOKING] Client found:', client?.key || client?.tenantKey);
    
    // SIMPLE APPROACH: Get phone from most recent call for this tenant
    const tenantKey = client?.key || client?.tenantKey || 'test_client';
    console.log('[BOOKING] Looking up most recent call for tenant:', tenantKey);
    
    let recentContext = getMostRecentCallContext(tenantKey);
    console.log('[BOOKING] Most recent call context:', JSON.stringify(recentContext, null, 2));
    
    // If cache has callId but no phone, fetch from VAPI API
    if (recentContext?.callId && !recentContext?.phone && process.env.VAPI_PRIVATE_KEY) {
      console.log('[BOOKING] 🔍 Have callId but no phone, fetching from VAPI API:', recentContext.callId);
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/call/${recentContext.callId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          if (vapiResponse.ok) {
            const callData = await vapiResponse.json();
          console.log('[BOOKING] ✅ Got call data from VAPI:', JSON.stringify(callData, null, 2));
          const phone = callData?.customer?.number || callData?.phoneNumber?.number || '';
          const name = callData?.customer?.name || '';
            if (phone) {
            recentContext.phone = phone;
            recentContext.name = name || recentContext.name;
            console.log('[BOOKING] ✅ Extracted from VAPI: phone:', phone, 'name:', name);
            }
        } else {
          console.error('[BOOKING] VAPI API returned status:', vapiResponse.status);
          }
        } catch (err) {
        console.error('[BOOKING] Failed to fetch from VAPI API:', err.message);
      }
    }
    
    if (!recentContext?.phone) {
      console.error('[BOOKING] No phone found after all attempts for tenant:', tenantKey);
        return res.status(400).json({ 
        error: 'No active call found. Please try again.',
        debug: { tenantKey, cacheEmpty: true }
      });
    }
    
    const phone = recentContext.phone;
    const customerName = recentContext.name || req.body?.customerName || 'Customer';
    
    console.log('[BOOKING] ✅ Using phone from cache:', phone);
    console.log('[BOOKING] ✅ Using name:', customerName);
    
    // Get basic client settings
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);
    const isDemo = isDemoClient(client);
    
    // Get service duration
    let services = client?.services ?? client?.servicesJson ?? [];
    if (!Array.isArray(services)) {
      try { services = JSON.parse(String(services)); } catch { services = []; }
    }
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const dur = (typeof req.body?.durationMinutes === 'number' && req.body.durationMinutes > 0)
      ? req.body.durationMinutes
      : (typeof req.body?.durationMin === 'number' && req.body.durationMin > 0)
      ? req.body.durationMin
      : (svc?.durationMin || client?.bookingDefaultDurationMin || 30);
    
    // Normalize phone
    const normalizedPhone = normalizePhoneE164(phone);
    if (!normalizedPhone) {
      console.error('[BOOKING] Failed to normalize phone:', phone);
      return res.status(400).json({ error: 'Phone must be valid E.164 format' });
    }
    
    // Ensure lead object has name and phone
    if (!req.body.lead) req.body.lead = {};
    req.body.lead.name = customerName;
    req.body.lead.phone = normalizedPhone;
    
    // Create a shorthand reference for easier access
    const lead = req.body.lead;

    const parseInTimezone = (value, timeZone) => {
      if (value == null) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const hasZone = trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed);
        if (hasZone) {
          const zoned = new Date(trimmed);
          return Number.isNaN(zoned.getTime()) ? null : zoned;
        }
        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (isoMatch) {
          const [, year, month, day, hour, minute, second] = isoMatch;
          
          // TIMEZONE FIX: Use Luxon to properly convert UK local time to UTC
          // This handles DST automatically (GMT in winter, BST in summer)
          try {
            const ukDateTime = DateTime.fromObject({
              year: Number(year),
              month: Number(month),
              day: Number(day),
              hour: Number(hour),
              minute: Number(minute),
              second: Number(second || 0)
            }, { zone: timeZone || 'Europe/London' });
            
            if (ukDateTime.isValid) {
              return ukDateTime.toJSDate(); // This gives us the correct UTC time
            }
          } catch (luxonError) {
            console.log('[TIMEZONE PARSE] Luxon conversion failed, falling back to UTC:', luxonError.message);
          }
          
          // Fallback: treat as UTC if Luxon fails
          const baseUtc = Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second || 0)
          );
          if (!Number.isNaN(baseUtc)) {
            return new Date(baseUtc);
          }
        }
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) return new Date(parsed);
      }
      return null;
    };

    const wantsDebug = process.env.LOG_BOOKING_DEBUG === 'true' || req.body?.debug === true || req.get('X-Debug-Booking') === 'true';
    const debugInfo = wantsDebug ? {} : null;

    const preferenceRaw = req.body?.startPref || req.body?.preferredStart || req.body?.requestedStart;
    const parsedFromPreference = parseStartPreference(preferenceRaw, tz);
    if (debugInfo) {
      debugInfo.preferenceRaw = preferenceRaw ?? null;
      debugInfo.parsedFromPreference = parsedFromPreference ? new Date(parsedFromPreference).toISOString() : null;
    }

    // Handle new VAPI structure with separate date and time fields
    let combinedDateTime = null;
    if (req.body?.date && req.body?.time) {
      combinedDateTime = `${req.body.date}T${req.body.time}:00`;
      console.log('[BOOKING] 📅 Combined date/time from new VAPI structure:', combinedDateTime);
    }

    const startHints = [
      combinedDateTime, // New VAPI structure: date + time
      req.body?.slot?.start,
      req.body?.slot?.startTime,
      req.body?.slot?.startISO,
      req.body?.slot?.startIso,
      req.body?.slot?.startDateTime,
      req.body?.slot?.startDate,
      req.body?.slot?.isoStart,
      req.body?.slot?.slotStart,
      req.body?.slot?.requestedStart,
      req.body?.slot?.scheduledStart,
      req.body?.slotStart,
      req.body?.selectedSlot?.start,
      req.body?.selectedSlot?.startTime,
      req.body?.selectedSlot?.startISO,
      req.body?.selectedSlot?.startIso,
      req.body?.start,
      req.body?.startTime,
      req.body?.startISO
    ].filter(Boolean);
    if (debugInfo) {
      debugInfo.startHints = startHints;
    }

    let demoOverrides = null;
    let startDate = null;
    for (const hint of startHints) {
      const parsed = parseInTimezone(hint, tz);
      if (parsed) {
        startDate = parsed;
        break;
      }
    }

    if (parsedFromPreference) {
      startDate = parsedFromPreference;
    }

    const referenceNow = DateTime.now().setZone(tz);
    demoOverrides = await getDemoOverrides({
      tenant: client?.clientKey || null,
      leadPhone: req.body.lead.phone,
      leadName: req.body.lead.name || null,
      service: requestedService || null
    }, { now: referenceNow, timezone: tz });

    if (demoOverrides?.slot?.iso) {
      const overrideDate = parseInTimezone(demoOverrides.slot.iso, tz);
      if (overrideDate) {
        startDate = overrideDate;
        if (debugInfo) {
          debugInfo.demoOverrideSlot = demoOverrides.slot.iso;
        }
      }
    }

    if (debugInfo && demoOverrides) {
      debugInfo.demoOverrides = formatOverridesForTelemetry(demoOverrides);
    }

    if (startDate) {
      const reference = referenceNow;
      let dt = DateTime.fromJSDate(startDate).setZone(tz);
      if (debugInfo) {
        debugInfo.reference = reference.toISO();
        debugInfo.initialResolved = dt.toISO();
      }
      const minFuture = reference.plus({ minutes: 15 });
      if (dt < reference) {
        const daysBehind = reference.diff(dt, 'days').days;
        if (debugInfo) {
          debugInfo.daysBehind = Number.isFinite(daysBehind) ? daysBehind : null;
        }
        if (Number.isFinite(daysBehind) && daysBehind > 6) {
          const weeksToAdd = Math.ceil(daysBehind / 7);
          if (debugInfo) {
            debugInfo.weeksToAdd = weeksToAdd;
          }
          if (weeksToAdd > 0) {
            dt = dt.plus({ weeks: weeksToAdd });
          }
        }
        while (dt < minFuture && daysBehind > 6) {
          dt = dt.plus({ weeks: 1 });
        }
        if (dt < minFuture) {
          dt = minFuture;
        }
      } else if (dt < minFuture) {
        dt = minFuture;
      }
      if (debugInfo) {
        debugInfo.afterAdjustment = dt.toISO();
      }
      startDate = dt.toJSDate();
    }

    if (process.env.LOG_BOOKING_DEBUG === 'true') {
      console.log('[BOOKING][check-book] start resolution', {
        tenant: client?.clientKey || null,
        hints: startHints,
        parsedStart: startDate ? startDate.toISOString() : null,
        timezone: tz
      });
    }

    // Default: book tomorrow ~14:00 in tenant TZ if no start provided
    if (!startDate) {
      const tenantNow = DateTime.now().setZone(tz || 'Europe/London');
      const tenantDefault = tenantNow.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
      startDate = tenantDefault.toJSDate();
    }

    const startISO = new Date(startDate).toISOString();
    const endISO = new Date(startDate.getTime() + dur * 60 * 1000).toISOString();

    // For demo clients, simulate booking without real integrations
    let google = { skipped: true };
    let sms = null;
    
    if (isDemo) {
      // For demo clients, use REAL bookings but with generic demo credentials
      // This allows reuse across all demos while still showing real functionality
      
      // Use demo calendar (from env or default to 'primary')
      const demoCalendarId = process.env.DEMO_GOOGLE_CALENDAR_ID || GOOGLE_CALENDAR_ID || 'primary';
      
      // Use demo phone number for SMS - prefer lead.phone (which we just looked up) over env vars
      // This ensures we use the actual phone number from the call, not a placeholder
      const demoSmsTo = lead.phone || process.env.DEMO_SMS_TO || process.env.TEST_PHONE_NUMBER;
      
      console.log('[DEMO BOOKING] Using real bookings with demo credentials:', {
        clientKey: client?.clientKey,
        calendarId: demoCalendarId,
        smsTo: demoSmsTo,
        leadName: lead.name,
        service: requestedService
      });
      
      // Real Google Calendar booking (using demo calendar)
      try {
        if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && demoCalendarId) {
          const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
          await auth.authorize();
          const summary = `[DEMO] ${requestedService || 'Appointment'} — ${lead.name || lead.phone}`;
          const description = [
            `Demo booking - Auto-booked by AI agent`,
            `Client: ${client?.displayName || client?.clientKey || 'Demo Client'}`,
            `Name: ${lead.name}`,
            `Phone: ${lead.phone}`,
            `Note: This is a demo booking`
          ].join('\\n');

          let event;
          try {
            event = await insertEvent({
              auth, calendarId: demoCalendarId, summary, description,
              startIso: startISO, endIso: endISO, timezone: tz
            });
          } catch (e) {
            const code = e?.response?.status || 500;
            const data = e?.response?.data || e?.message || String(e);
            console.warn('[DEMO BOOKING] Google Calendar error:', data);
            google = { skipped: true, error: String(data) };
            event = null;
          }

          if (event) {
            google = { id: event.id, htmlLink: event.htmlLink, status: event.status, demo: true };
            console.log('[DEMO BOOKING] Real calendar event created:', event.id);
          }
        } else {
          google = { skipped: true, reason: 'no_google_credentials' };
        }
      } catch (err) {
        console.error('[DEMO BOOKING] Google Calendar error:', err);
        google = { error: String(err) };
      }

      // Real SMS confirmation (using demo phone number)
      const startDt = DateTime.fromISO(startISO, { zone: tz });
      const when = startDt.isValid
        ? startDt.toFormat('ccc dd LLL yyyy • hh:mma')
        : new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
            timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
            hour: 'numeric', minute: '2-digit', hour12: true
          });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
      const defaultBody = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
      const template = client?.smsTemplates?.confirm || defaultBody;
      const templateVars = {
        name: lead.name,
        service: requestedService || 'appointment',
        brand,
        when,
        tz,
        link,
        sig,
        duration: dur,
        day: startDt.isValid ? startDt.toFormat('cccc') : null,
        date: startDt.isValid ? startDt.toFormat('dd LLL yyyy') : null,
        time: startDt.isValid ? startDt.toFormat('HH:mm') : null
      };
      const body = renderTemplate(template, templateVars);

      // Use Twilio to send real SMS to demo number
      try {
        const twilioFromNumber = TWILIO_FROM_NUMBER || process.env.DEMO_SMS_FROM;
        
        if (defaultSmsClient && (TWILIO_MESSAGING_SERVICE_SID || twilioFromNumber)) {
          const payload = { to: demoSmsTo, body: body };
          if (TWILIO_MESSAGING_SERVICE_SID) {
            payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
          } else {
            payload.from = twilioFromNumber;
          }
          const smsResponse = await defaultSmsClient.messages.create(payload);
          sms = { id: smsResponse.sid, to: demoSmsTo, demo: true };
          console.log('[DEMO BOOKING] Real SMS sent to demo number:', demoSmsTo);
        } else {
          sms = { skipped: true, reason: 'no_twilio_credentials' };
          console.warn('[DEMO BOOKING] Twilio not configured, skipping SMS');
        }
      } catch (smsError) {
        console.error('[DEMO BOOKING] SMS error:', smsError);
        sms = { error: String(smsError) };
      }
      
      // Save appointment to database so it shows up in dashboard (with transaction safety)
      try {
        const { withTransaction } = await import('../db.js');
        await withTransaction(async (txQuery) => {
        // Get or create lead first
        let leadId = null;
          const lmk = phoneMatchKey(lead.phone);
          const existingLead = await txQuery(
            lmk
              ? 'SELECT id FROM leads WHERE client_key = $1 AND phone_match_key = $2 LIMIT 1'
              : 'SELECT id FROM leads WHERE client_key = $1 AND phone = $2 LIMIT 1',
            lmk ? [client?.clientKey, lmk] : [client?.clientKey, lead.phone]
          );
        
        if (existingLead?.rows?.[0]?.id) {
          leadId = existingLead.rows[0].id;
        } else {
          // Create lead if it doesn't exist
            const newLead = await txQuery(
            'INSERT INTO leads (client_key, name, phone, phone_match_key, service, status, source) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [client?.clientKey, lead.name, lead.phone, lmk, requestedService || 'appointment', 'booked', 'demo']
          );
          if (newLead?.rows?.[0]?.id) {
            leadId = newLead.rows[0].id;
          }
        }
        
        // Save appointment to database
        if (leadId && google?.id) {
            await txQuery(
            'INSERT INTO appointments (client_key, lead_id, gcal_event_id, start_iso, end_iso, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [client?.clientKey, leadId, google.id, startISO, endISO, 'booked']
          );
            console.log('[DEMO BOOKING] Appointment saved to database (transaction committed)');
        }
        });
      } catch (dbError) {
        console.warn('[DEMO BOOKING] Could not save appointment to database:', dbError.message);
      }
    } else {
      // Real booking flow for non-demo clients
      try {
        if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
          const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
          await auth.authorize();
          const summary = `${requestedService || 'Appointment'} — ${lead.name || lead.phone}`;
          const description = [
            `Auto-booked by AI agent`,
            `Tenant: ${client?.clientKey || 'default'}`,
            `Name: ${lead.name}`,
            `Phone: ${lead.phone}`
          ].join('\\n');

          const attendees = []; // removed invites

          let event;
          try {
            const maybeRetry =
              typeof withRetry === 'function'
                ? withRetry
                : async (fn) => fn();
            event = await maybeRetry(() => insertEvent({
              auth, calendarId, summary, description,
              startIso: startISO, endIso: endISO, timezone: tz
            }), { retries: 2, delayMs: 300 });
          } catch (e) {
            const code = e?.response?.status || 500;
            const data = e?.response?.data || e?.message || String(e);
            // If Google credentials are missing/invalid, skip calendar insert but continue
            const grantError = typeof data === 'string' && data.includes('invalid_grant');
            if (!grantError) {
              return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
            }
            console.warn('[GCAL] Skipping insert due to invalid credentials', data);
            google = { skipped: true, error: 'invalid_grant' };
            event = null;
          }

          if (event) {
            google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
          }
        }
      } catch (err) {
        console.error(JSON.stringify({ evt: 'gcal.error', rid: req.id, error: String(err) }));
        google = { error: String(err) };
      }

      // Real SMS flow for non-demo clients
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      const smsOverrides = demoOverrides?.sms;
      if (configured && !(smsOverrides?.skip === true)) {
        const startDt = DateTime.fromISO(startISO, { zone: tz });
        const when = startDt.isValid
          ? startDt.toFormat('ccc dd LLL yyyy • hh:mma')
          : new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
              timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
              hour: 'numeric', minute: '2-digit', hour12: true
            });
        const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
        const defaultBody = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
        const template = smsOverrides?.message || client?.smsTemplates?.confirm || defaultBody;
        const templateVars = {
          name: lead.name,
          service: requestedService || 'appointment',
          brand,
          when,
          tz,
          link,
          sig,
          duration: dur,
          day: startDt.isValid ? startDt.toFormat('cccc') : null,
          date: startDt.isValid ? startDt.toFormat('dd LLL yyyy') : null,
          time: startDt.isValid ? startDt.toFormat('HH:mm') : null
        };
        const body = renderTemplate(template, templateVars);

        try {
          const payload = { to: lead.phone, body };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
          else payload.from = fromNumber;
          const resp = await smsClient.messages.create(payload);
          sms = { id: resp.sid, to: lead.phone, override: Boolean(smsOverrides) };
        } catch (err) {
          console.error(JSON.stringify({ evt: 'sms.error', rid: req.id, error: String(err) }));
          sms = { error: String(err) };
        }
      } else if (configured && smsOverrides?.skip === true) {
        sms = { skipped: true, reason: 'demo_skip' };
      }
    }

    const calls = await readJson(CALLS_PATH, []);
    const record = {
      id: 'call_' + nanoid(10),
      tenant: client?.clientKey || null,
      status: 'booked',
      booking: { start: startISO, end: endISO, service: requestedService || null, google, sms },
      created_at: new Date().toISOString()
    };
    calls.push(record);
    await writeJson(CALLS_PATH, calls);

    const responseBody = { slot: { start: startISO, end: endISO, timezone: tz }, google, sms, tenant: client?.clientKey || 'default' };
    if (debugInfo) {
      debugInfo.finalStart = startISO;
      responseBody.debug = debugInfo;
    }

    if (process.env.DEMO_MODE === 'true') {
      const googleTelemetry = google
        ? {
            id: google.id || null,
            status: google.status || null,
            skipped: Boolean(google.skipped),
            error: google.error || null
          }
        : null;
      const smsTelemetry = sms
        ? {
            id: sms.id || null,
            error: sms.error || null,
            skipped: Boolean(sms.skipped),
            override: sms.override || false
          }
        : null;
      const telemetryPayload = {
        evt: 'booking.checkAndBook',
        tenant: client?.clientKey || null,
        service: requestedService || null,
        durationMin: dur,
        lead: {
          name: lead.name,
          phone: lead.phone
        },
        slot: {
          finalIso: startISO,
          endIso: endISO,
          preferenceRaw,
          hintsCount: startHints.length
        },
        overrides: formatOverridesForTelemetry(demoOverrides),
        google: googleTelemetry,
        sms: smsTelemetry,
        elapsedMs: Date.now() - requestStartedAt,
        requestId: req.id || null
      };
      recordDemoTelemetry(telemetryPayload);
    }

    // Record successful idempotency using new library
    try {
      const { recordIdempotency } = await import('./idempotency.js');
      await recordIdempotency(clientKey, 'booking', idemKey, responseBody);
    } catch (idemError) {
      console.warn('[BOOKING] Failed to record idempotency, using fallback:', idemError.message);
    setCachedIdem(idemKey, 200, responseBody);
    }
    
    return res.json(responseBody);
  } catch (e) {
    console.error('[BOOKING][check-book] ❌❌❌ CAUGHT ERROR IN OUTER CATCH:', e);
    console.error('[BOOKING][check-book] Error stack:', e?.stack);
    console.error('[BOOKING][check-book] Error message:', e?.message);
    
    // Send email alert for failed booking (Quick Win #2)
    if (process.env.YOUR_EMAIL) {
      try {
        const messagingService = (await import('./messaging-service.js')).default;
        const client = await getClientFromHeader(req).catch(() => null);
        await messagingService.sendEmail({
          to: process.env.YOUR_EMAIL,
          subject: `🚨 Booking Failed - ${client?.clientKey || 'unknown'}`,
          body: `Booking failed\n\nClient: ${client?.clientKey || 'unknown'}\nLead: ${req.body?.lead?.name || 'unknown'} (${req.body?.lead?.phone || 'unknown'})\nService: ${req.body?.service || 'unknown'}\nError: ${e.message}\nStack: ${e.stack}\nTime: ${new Date().toISOString()}`
        });
      } catch (emailError) {
        console.error('[BOOKING] Failed to send alert email:', emailError.message);
      }
    }
    
    const status = 500;
    const body = { error: String(e) };
    
    // Record failed idempotency using new library
    try {
      const { recordIdempotency } = await import('./idempotency.js');
      await recordIdempotency(clientKey, 'booking', idemKey, body);
    } catch (idemError) {
      console.warn('[BOOKING] Failed to record idempotency, using fallback:', idemError.message);
    setCachedIdem(idemKey, status, body);
    }
    return res.status(status).json(body);
  }
}
