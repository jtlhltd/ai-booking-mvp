import {
  isBusinessHoursForTenant,
  getNextBusinessOpenForTenant
} from './business-hours.js';

export function safeAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[UNHANDLED ERROR]', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

export function createBusinessHoursHelpers(TIMEZONE) {
  function isBusinessHours(tenant = null) {
    const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
    return isBusinessHoursForTenant(tenant, new Date(), tz, { forOutboundDial: true });
  }

  function getNextBusinessHour(tenant = null) {
    const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
    return getNextBusinessOpenForTenant(tenant, new Date(), tz, { forOutboundDial: true });
  }

  return { isBusinessHours, getNextBusinessHour };
}

export async function selectOptimalAssistant({ client, existingLead, isYes, isStart }) {
  try {
    const leadScore = existingLead?.score || 0;
    const industry = client?.industry || 'general';
    const timeOfDay = new Date().getHours();

    const DEFAULT_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '';
    const DEFAULT_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

    let assistantId = client?.vapiAssistantId || client?.vapi?.assistantId || DEFAULT_ASSISTANT_ID;
    let phoneNumberId = client?.vapiPhoneNumberId || client?.vapi?.phoneNumberId || DEFAULT_PHONE_NUMBER_ID;

    if (leadScore >= 80) {
      assistantId = client?.vapiHighValueAssistantId || assistantId;
      phoneNumberId = client?.vapiHighValuePhoneNumberId || phoneNumberId;

      console.log('[ASSISTANT SELECTION]', {
        reason: 'high_value_lead',
        leadScore,
        assistantId,
        phoneNumberId
      });
    } else if (client?.vapiIndustryAssistants && client.vapiIndustryAssistants[industry]) {
      const industryConfig = client.vapiIndustryAssistants[industry];
      assistantId = industryConfig.assistantId || assistantId;
      phoneNumberId = industryConfig.phoneNumberId || phoneNumberId;

      console.log('[ASSISTANT SELECTION]', {
        reason: 'industry_specific',
        industry,
        assistantId,
        phoneNumberId
      });
    } else if (timeOfDay >= 9 && timeOfDay <= 17) {
      assistantId = client?.vapiBusinessHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiBusinessHoursPhoneNumberId || phoneNumberId;

      console.log('[ASSISTANT SELECTION]', {
        reason: 'business_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    } else {
      assistantId = client?.vapiAfterHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiAfterHoursPhoneNumberId || phoneNumberId;

      console.log('[ASSISTANT SELECTION]', {
        reason: 'after_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    }

    if (!assistantId || !phoneNumberId) {
      console.warn('[ASSISTANT VALIDATION]', {
        warning: 'missing_assistant_config',
        assistantId: !!assistantId,
        phoneNumberId: !!phoneNumberId,
        fallbackToDefault: true
      });

      assistantId = process.env.VAPI_ASSISTANT_ID || '';
      phoneNumberId = DEFAULT_PHONE_NUMBER_ID;
    }

    return { assistantId, phoneNumberId };
  } catch (error) {
    console.error('[ASSISTANT SELECTION ERROR]', error);
    const DEFAULT_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '';
    const DEFAULT_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';
    return {
      assistantId: client?.vapiAssistantId || client?.vapi?.assistantId || DEFAULT_ASSISTANT_ID,
      phoneNumberId: client?.vapiPhoneNumberId || client?.vapi?.phoneNumberId || DEFAULT_PHONE_NUMBER_ID
    };
  }
}

async function buildAssistantVariablesPayload(
  { client, existingLead, tenantKey, serviceForCall, isYes, isStart },
  { isBusinessHours, TIMEZONE }
) {
  try {
    const now = new Date();
    const leadScore = existingLead?.score || 0;
    const leadStatus = existingLead?.status || 'new';
    const industry = client?.industry || 'general';
    const timeOfDay = now.getHours();
    const dayOfWeek = now.getDay();
    const isBusinessTime = isBusinessHours(client);

    const variables = {
      ClientKey: tenantKey,
      BusinessName: client.displayName || client.clientKey,
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      ServicesJSON: client?.servicesJson || '[]',
      PricesJSON: client?.pricesJson || '{}',
      HoursJSON: client?.hoursJson || '{}',
      ClosedDatesJSON: client?.closedDatesJson || '[]',
      Locale: client?.locale || 'en-GB',
      ScriptHints: client?.scriptHints || '',
      FAQJSON: client?.faqJson || '[]',
      Currency: client?.currency || 'GBP',
      LeadScore: leadScore,
      LeadStatus: leadStatus,
      BusinessHours: isBusinessTime ? 'within' : 'outside'
    };

    variables.CallContext = isYes ? 'yes_response' : 'start_opt_in';
    variables.TimeOfDay = timeOfDay;
    variables.DayOfWeek = dayOfWeek;
    variables.Industry = industry;

    if (existingLead) {
      variables.LeadAge = existingLead.createdAt
        ? Math.floor((now - new Date(existingLead.createdAt)) / (1000 * 60 * 60 * 24))
        : 0;
      variables.PreviousInteractions = existingLead.messageCount || 0;
      variables.LastInteraction = existingLead.lastInboundAt || existingLead.createdAt;
    }

    if (isYes) {
      variables.GreetingStyle = 'enthusiastic';
      variables.CallPurpose = 'booking_confirmation';
    } else if (isStart) {
      variables.GreetingStyle = 'welcoming';
      variables.CallPurpose = 'initial_consultation';
    } else {
      variables.GreetingStyle = 'professional';
      variables.CallPurpose = 'follow_up';
    }

    switch (industry.toLowerCase()) {
      case 'healthcare':
      case 'medical':
      case 'dental':
        variables.IndustryTone = 'caring';
        variables.PrivacyNotice = 'Your health information is confidential.';
        break;
      case 'legal':
        variables.IndustryTone = 'authoritative';
        variables.PrivacyNotice = 'Attorney-client privilege applies.';
        break;
      case 'financial':
        variables.IndustryTone = 'trustworthy';
        variables.PrivacyNotice = 'Your financial information is secure.';
        break;
      default:
        variables.IndustryTone = 'professional';
        variables.PrivacyNotice = 'Your information is confidential.';
    }

    if (timeOfDay < 12) {
      variables.TimeGreeting = 'Good morning';
    } else if (timeOfDay < 17) {
      variables.TimeGreeting = 'Good afternoon';
    } else {
      variables.TimeGreeting = 'Good evening';
    }

    if (leadScore >= 80) {
      variables.PriorityLevel = 'high';
      variables.CallDuration = 'extended';
      variables.FollowUpRequired = 'yes';
    } else if (leadScore >= 50) {
      variables.PriorityLevel = 'medium';
      variables.CallDuration = 'standard';
      variables.FollowUpRequired = 'maybe';
    } else {
      variables.PriorityLevel = 'low';
      variables.CallDuration = 'brief';
      variables.FollowUpRequired = 'no';
    }

    if (!isBusinessTime) {
      variables.AfterHoursMessage = 'We appreciate you reaching out after hours.';
      variables.AvailabilityNote = 'Our regular hours are Monday-Friday 9AM-5PM.';
    }

    console.log('[ASSISTANT VARIABLES]', {
      tenantKey,
      leadScore,
      industry,
      timeOfDay,
      variablesCount: Object.keys(variables).length
    });

    return variables;
  } catch (error) {
    console.error('[ASSISTANT VARIABLES ERROR]', error);

    return {
      ClientKey: tenantKey,
      BusinessName: client?.displayName || client?.clientKey || 'Our Business',
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      LeadScore: existingLead?.score || 0,
      LeadStatus: existingLead?.status || 'new',
      BusinessHours: isBusinessHours(client) ? 'within' : 'outside'
    };
  }
}

export async function getRecentCallsCountFromDb(tenantKey, minutesBack = 60) {
  try {
    const { getRecentCallsCount } = await import('../db.js');
    return await getRecentCallsCount(tenantKey, minutesBack);
  } catch (error) {
    console.error('[RECENT CALLS COUNT ERROR]', error);
    return 0;
  }
}

async function determineCallSchedulingPayload(
  { tenantKey, from, isYes, isStart, existingLead },
  { getFullClient, TIMEZONE, isBusinessHours, getNextBusinessHour }
) {
  try {
    const client = await getFullClient(tenantKey);
    const now = new Date();
    const tz = client?.booking?.timezone || client?.timezone || TIMEZONE;
    const tenantTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = tenantTime.getHours();
    const day = tenantTime.getDay();

    if (isYes && existingLead?.score >= 80) {
      return { shouldDelay: false, priority: 'high', reason: 'high_score_yes_response' };
    }

    if (!isBusinessHours(client)) {
      const nextBusinessHour = getNextBusinessHour(client);
      return {
        shouldDelay: true,
        reason: 'outside_business_hours',
        scheduledFor: nextBusinessHour,
        priority: 'normal'
      };
    }

    if (hour >= 12 && hour <= 14) {
      const delayUntil = new Date(tenantTime.getTime() + 2 * 60 * 60 * 1000);
      return {
        shouldDelay: true,
        reason: 'lunch_hours',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }

    if (day === 0 || day === 6) {
      const nextMonday = new Date(tenantTime);
      nextMonday.setDate(tenantTime.getDate() + (8 - day));
      nextMonday.setHours(9, 0, 0, 0);
      return {
        shouldDelay: true,
        reason: 'weekend',
        scheduledFor: nextMonday,
        priority: 'low'
      };
    }

    const recentCalls = await getRecentCallsCountFromDb(tenantKey, 60);
    if (recentCalls > 10) {
      const delayUntil = new Date(tenantTime.getTime() + 30 * 60 * 1000);
      return {
        shouldDelay: true,
        reason: 'rate_limit',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }

    return { shouldDelay: false, priority: 'normal', reason: 'optimal_timing' };
  } catch (error) {
    console.error('[CALL SCHEDULING ERROR]', error);
    return { shouldDelay: false, priority: 'normal', reason: 'error_fallback' };
  }
}

export function calculateLeadScore(lead, tenant = null) {
  let score = 0;

  if (lead.consentSms) score += 30;

  if (lead.status === 'engaged') score += 20;
  if (lead.status === 'opted_out') score = 0;

  if (lead.lastInboundAt && lead.createdAt) {
    const responseTime = new Date(lead.lastInboundAt) - new Date(lead.createdAt);
    const responseMinutes = responseTime / (1000 * 60);
    if (responseMinutes < 5) score += 25;
    else if (responseMinutes < 30) score += 15;
    else if (responseMinutes < 60) score += 10;
  }

  if (lead.lastInboundText) {
    const text = lead.lastInboundText.toLowerCase();

    if (text.includes('urgent') || text.includes('asap') || text.includes('emergency')) score += 20;
    if (text.includes('book') || text.includes('appointment') || text.includes('schedule')) score += 15;
    if (text.includes('price') || text.includes('cost') || text.includes('quote')) score += 10;

    if (text.includes('?')) score += 5;

    if (text.length > 50) score += 5;
    if (text.length > 100) score += 5;
  }

  if (lead.lastInboundAt) {
    const hoursSinceLastContact = (new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60);
    if (hoursSinceLastContact < 1) score += 15;
    else if (hoursSinceLastContact < 24) score += 10;
    else if (hoursSinceLastContact < 72) score += 5;
  }

  if (tenant?.leadScoring) {
    const tenantRules = tenant.leadScoring;
    if (tenantRules.highValueKeywords) {
      const text = (lead.lastInboundText || '').toLowerCase();
      for (const keyword of tenantRules.highValueKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += tenantRules.keywordScore || 10;
        }
      }
    }
  }

  return Math.min(score, 100);
}

export function getLeadPriority(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'low';
  return 'very_low';
}

/**
 * Bound helpers for Twilio inbound + server composition (legacy arity preserved).
 */
export function createOutboundSchedulingContext({ TIMEZONE, getFullClient }) {
  const { isBusinessHours, getNextBusinessHour } = createBusinessHoursHelpers(TIMEZONE);

  async function generateAssistantVariables(args) {
    return buildAssistantVariablesPayload(args, { isBusinessHours, TIMEZONE });
  }

  async function determineCallScheduling(args) {
    return determineCallSchedulingPayload(args, {
      getFullClient,
      TIMEZONE,
      isBusinessHours,
      getNextBusinessHour
    });
  }

  return {
    isBusinessHours,
    getNextBusinessHour,
    generateAssistantVariables,
    determineCallScheduling
  };
}
