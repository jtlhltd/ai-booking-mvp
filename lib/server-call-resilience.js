const circuitBreakerState = new Map();

export function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;

  if (message.includes('timeout') || message.includes('econnreset') || message.includes('enotfound')) {
    return 'network';
  }

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }

  if (status >= 500 && status < 600) {
    return 'server_error';
  }

  if (status >= 400 && status < 500) {
    return 'client_error';
  }

  if (message.includes('vapi') || message.includes('assistant') || message.includes('phone number')) {
    return 'vapi_error';
  }

  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('invalid key')) {
    return 'critical';
  }

  return 'unknown';
}

export function shouldRetryError(errorType, attempt, maxRetries) {
  const retryableErrors = ['network', 'server_error', 'rate_limit'];
  const nonRetryableErrors = ['client_error', 'critical'];

  if (nonRetryableErrors.includes(errorType)) {
    return false;
  }

  if (retryableErrors.includes(errorType)) {
    return attempt < maxRetries;
  }

  return attempt === 1;
}

export function calculateRetryDelay(baseDelay, attempt, errorType) {
  let delay = baseDelay * Math.pow(2, attempt - 1);

  if (errorType === 'rate_limit') {
    delay = Math.max(delay, 5000);
  }

  const jitter = delay * 0.25 * (Math.random() - 0.5);
  delay = Math.max(100, delay + jitter);

  return Math.floor(delay);
}

export async function updateCircuitBreakerState(operation, state) {
  circuitBreakerState.set(operation, {
    state,
    timestamp: Date.now(),
    failureCount: state === 'open' ? (circuitBreakerState.get(operation)?.failureCount || 0) + 1 : 0
  });

  console.log(`[CIRCUIT BREAKER]`, {
    operation,
    state,
    failureCount: circuitBreakerState.get(operation)?.failureCount || 0
  });
}

export function isCircuitBreakerOpen(operation) {
  const state = circuitBreakerState.get(operation);
  if (!state) return false;

  const recoveryTime = 5 * 60 * 1000;
  if (state.state === 'open' && Date.now() - state.timestamp > recoveryTime) {
    circuitBreakerState.set(operation, { state: 'half-open', timestamp: Date.now() });
    console.log(`[CIRCUIT BREAKER RECOVERY]`, { operation, state: 'half-open' });
    return false;
  }

  return state.state === 'open';
}

export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, context = {}) {
  const { operation = 'unknown', tenantKey = 'unknown', leadPhone = 'unknown' } = context;

  if (isCircuitBreakerOpen(operation)) {
    throw new Error(`Circuit breaker is open for operation: ${operation}`);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      if (attempt > 1) {
        console.log(`[RETRY SUCCESS]`, {
          operation,
          tenantKey,
          leadPhone,
          attempt,
          totalAttempts: attempt
        });
      }

      if (attempt > 1) {
        await updateCircuitBreakerState(operation, 'closed');
      }

      return result;
    } catch (error) {
      const errorType = categorizeError(error);
      const shouldRetry = shouldRetryError(errorType, attempt, maxRetries);

      console.error(`[RETRY ATTEMPT ${attempt}/${maxRetries}]`, {
        operation,
        tenantKey,
        leadPhone,
        errorType,
        error: error.message,
        shouldRetry,
        attempt
      });

      if (!shouldRetry || attempt === maxRetries) {
        console.error(`[RETRY FAILED]`, {
          operation,
          tenantKey,
          leadPhone,
          finalAttempt: attempt,
          errorType,
          error: error.message
        });

        if (errorType === 'critical') {
          await updateCircuitBreakerState(operation, 'open');
        }

        throw error;
      }

      const delay = calculateRetryDelay(baseDelay, attempt, errorType);
      console.log(`[RETRY DELAY]`, {
        operation,
        tenantKey,
        delay: `${delay}ms`,
        nextAttempt: attempt + 1,
        errorType
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function checkBudgetBeforeCall(tenantKey, estimatedCost = 0.05) {
  try {
    const { checkBudgetExceeded, checkCostAlerts } = await import('../db.js');

    const dailyBudget = await checkBudgetExceeded(tenantKey, 'vapi_calls', 'daily');
    if (dailyBudget.exceeded) {
      console.log('[BUDGET EXCEEDED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'daily_budget_exceeded', budget: dailyBudget };
    }

    if (dailyBudget.current + estimatedCost > dailyBudget.limit) {
      console.log('[BUDGET WOULD EXCEED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'would_exceed_daily_budget', budget: dailyBudget };
    }

    const alerts = await checkCostAlerts(tenantKey);
    if (alerts.length > 0) {
      console.log('[COST ALERTS TRIGGERED]', {
        tenantKey,
        alerts: alerts.map(a => a.message)
      });
    }

    return { allowed: true, budget: dailyBudget };
  } catch (error) {
    console.error('[BUDGET CHECK ERROR]', error);
    return { allowed: true, reason: 'budget_check_failed' };
  }
}

export async function trackCallCost(tenantKey, callId, cost, metadata = {}) {
  try {
    const { trackCost } = await import('../db.js');

    await trackCost({
      clientKey: tenantKey,
      callId,
      costType: 'vapi_call',
      amount: cost,
      currency: 'USD',
      description: `VAPI call cost tracking`,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });

    console.log('[CALL COST TRACKED]', {
      tenantKey,
      callId,
      cost: `$${cost}`,
      type: 'vapi_call'
    });
  } catch (error) {
    console.error('[COST TRACKING ERROR]', error);
  }
}

export function generateCostRecommendations(costs, budgetStatus) {
  const recommendations = [];

  if (costs.total_cost > 0) {
    const avgCostPerCall = costs.total_cost / costs.transaction_count;

    if (avgCostPerCall > 0.10) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        message: `Average call cost is $${avgCostPerCall.toFixed(2)}. Consider optimizing assistant prompts to reduce call duration.`
      });
    }

    if (budgetStatus.vapi_calls?.daily?.percentage > 80) {
      recommendations.push({
        type: 'budget_alert',
        priority: 'medium',
        message: `Daily budget utilization is ${budgetStatus.vapi_calls.daily.percentage.toFixed(1)}%. Consider setting up budget alerts.`
      });
    }

    if (costs.transaction_count > 50) {
      recommendations.push({
        type: 'volume_optimization',
        priority: 'low',
        message: `High call volume (${costs.transaction_count} calls). Consider implementing call scheduling to optimize timing.`
      });
    }
  }

  return recommendations;
}

export async function getCostOptimizationMetrics(tenantKey) {
  try {
    const {
      getTotalCostsByTenant,
      getCostsByPeriod,
      getBudgetLimits,
      checkBudgetExceeded
    } = await import('../db.js');

    const [dailyCosts, weeklyCosts, monthlyCosts, budgetLimits] = await Promise.all([
      getTotalCostsByTenant(tenantKey, 'daily'),
      getTotalCostsByTenant(tenantKey, 'weekly'),
      getTotalCostsByTenant(tenantKey, 'monthly'),
      getBudgetLimits(tenantKey)
    ]);

    const costBreakdown = await getCostsByPeriod(tenantKey, 'daily');

    const budgetStatus = {};
    for (const budget of budgetLimits) {
      budgetStatus[budget.budget_type] = {
        daily: await checkBudgetExceeded(tenantKey, budget.budget_type, 'daily'),
        weekly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'weekly'),
        monthly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'monthly')
      };
    }

    return {
      costs: {
        daily: dailyCosts,
        weekly: weeklyCosts,
        monthly: monthlyCosts,
        breakdown: costBreakdown
      },
      budgets: budgetLimits,
      budgetStatus,
      optimization: {
        costPerCall: dailyCosts.transaction_count > 0 ? dailyCosts.total_cost / dailyCosts.transaction_count : 0,
        dailyBudgetUtilization: budgetStatus.vapi_calls?.daily?.percentage || 0,
        recommendations: generateCostRecommendations(dailyCosts, budgetStatus)
      }
    };
  } catch (error) {
    console.error('[COST METRICS ERROR]', error);
    return null;
  }
}

export function createVapiFailureHandlers(deps) {
  const { getFullClient, listFullClients, upsertFullClient, smsConfig } = deps;

  async function sendSmsFallback({ from, tenantKey, client, error }) {
    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (!configured) {
        console.log('[SMS FALLBACK SKIP]', { reason: 'sms_not_configured', tenantKey });
        return;
      }

      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const fallbackMessage = `Hi! ${brand} tried to call you but had a technical issue. Please call us back at ${client?.phone || 'our main number'} or reply with your preferred time.`;

      await smsClient.messages.create({
        body: fallbackMessage,
        messagingServiceSid,
        to: from
      });

      console.log('[SMS FALLBACK SENT]', { from, tenantKey, message: fallbackMessage });
    } catch (smsError) {
      console.error('[SMS FALLBACK ERROR]', { from, tenantKey, error: smsError.message });
    }
  }

  async function scheduleRetryCall({ from, tenantKey, client, error }) {
    try {
      const errorType = categorizeError({ message: error });
      let retryDelay = 30 * 60 * 1000;

      if (errorType === 'rate_limit') {
        retryDelay = 60 * 60 * 1000;
      } else if (errorType === 'server_error') {
        retryDelay = 15 * 60 * 1000;
      } else if (errorType === 'critical') {
        retryDelay = 2 * 60 * 60 * 1000;
      }

      const retryTime = new Date(Date.now() + retryDelay);

      const { addToRetryQueue } = await import('../db.js');

      const retryData = {
        originalError: error,
        errorType,
        clientConfig: {
          assistantId: client?.vapi?.assistantId,
          phoneNumberId: client?.vapi?.phoneNumberId
        }
      };

      await addToRetryQueue({
        clientKey: tenantKey,
        leadPhone: from,
        retryType: 'vapi_call',
        retryReason: errorType,
        retryData,
        scheduledFor: retryTime,
        retryAttempt: 1,
        maxRetries: 3
      });

      console.log('[RETRY SCHEDULED]', {
        from,
        tenantKey,
        errorType,
        retryTime: retryTime.toISOString(),
        retryDelay: `${retryDelay / 1000 / 60} minutes`,
        queued: true
      });
    } catch (retryError) {
      console.error('[RETRY SCHEDULE ERROR]', { from, tenantKey, error: retryError.message });
    }
  }

  async function updateLeadOnVapiFailure({ from, tenantKey, error }) {
    try {
      const clients = await listFullClients();
      const leads = clients.flatMap(client => client.leads || []);
      const lead = leads.find(l => l.phone === from && l.tenantKey === tenantKey);

      if (lead) {
        lead.status = 'vapi_failed';
        lead.lastVapiError = error;
        lead.lastVapiAttempt = new Date().toISOString();

        const client = await getFullClient(tenantKey);
        if (client) {
          client.leads = leads.filter(l => l.tenantKey === tenantKey);
          client.updatedAt = new Date().toISOString();
          await upsertFullClient(client);

          console.log('[LEAD STATUS UPDATED]', {
            from,
            tenantKey,
            newStatus: 'vapi_failed',
            error
          });
        }
      }
    } catch (updateError) {
      console.error('[LEAD UPDATE ERROR]', { from, tenantKey, error: updateError.message });
    }
  }

  async function handleVapiFailure({ from, tenantKey, error }) {
    try {
      console.log('[VAPI FALLBACK]', { from, tenantKey, error });

      const client = await getFullClient(tenantKey);
      if (!client) {
        console.error('[VAPI FALLBACK ERROR]', { reason: 'client_not_found', tenantKey });
        return;
      }

      await sendSmsFallback({ from, tenantKey, client, error });
      await scheduleRetryCall({ from, tenantKey, client, error });
      await updateLeadOnVapiFailure({ from, tenantKey, error });
    } catch (fallbackError) {
      console.error('[VAPI FALLBACK ERROR]', {
        from,
        tenantKey,
        originalError: error,
        fallbackError: fallbackError.message
      });
    }
  }

  return { handleVapiFailure, sendSmsFallback, scheduleRetryCall, updateLeadOnVapiFailure };
}
