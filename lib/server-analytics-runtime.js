import { getCache } from './cache.js';
import { getFullClient } from '../db.js';

const cache = getCache();

// Analytics and reporting functions
export async function trackAnalyticsEvent({ clientKey, eventType, eventCategory, eventData, sessionId, userAgent, ipAddress }) {
  try {
    const { trackAnalyticsEvent } = await import('../db.js');
    return await trackAnalyticsEvent({
      clientKey,
      eventType,
      eventCategory,
      eventData,
      sessionId,
      userAgent,
      ipAddress
    });
  } catch (error) {
    console.error('[ANALYTICS TRACKING ERROR]', error);
  }
}

export async function trackConversionStage({ clientKey, leadPhone, stage, stageData, previousStage = null, timeToStage = null }) {
  try {
    const { trackConversionStage } = await import('../db.js');
    return await trackConversionStage({
      clientKey,
      leadPhone,
      stage,
      stageData,
      previousStage,
      timeToStage
    });
  } catch (error) {
    console.error('[CONVERSION TRACKING ERROR]', error);
  }
}

export async function recordPerformanceMetric({ clientKey, metricName, metricValue, metricUnit = null, metricCategory = null, metadata = null }) {
  try {
    const { recordPerformanceMetric } = await import('../db.js');
    return await recordPerformanceMetric({
      clientKey,
      metricName,
      metricValue,
      metricUnit,
      metricCategory,
      metadata
    });
  } catch (error) {
    console.error('[PERFORMANCE METRIC ERROR]', error);
  }
}

export async function getAnalyticsDashboard(clientKey, days = 30) {
  try {
    const { 
      getAnalyticsSummary,
      getConversionFunnel,
      getConversionRates,
      getPerformanceMetrics,
      getTotalCostsByTenant,
      getCallsByTenant
    } = await import('../db.js');
    
    const [
      analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics
    ] = await Promise.all([
      getAnalyticsSummary(clientKey, days),
      getConversionFunnel(clientKey, days),
      getConversionRates(clientKey, days),
      getPerformanceMetrics(clientKey, null, days),
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 1000)
    ]);
    
    // Calculate key metrics
    const totalLeads = conversionFunnel.reduce((sum, stage) => sum + stage.unique_leads, 0);
    const totalCalls = callMetrics.length;
    const successfulCalls = callMetrics.filter(call => call.outcome === 'completed').length;
    const conversionRate = totalLeads > 0 ? (successfulCalls / totalLeads) * 100 : 0;
    const avgCallDuration = callMetrics.reduce((sum, call) => sum + (call.duration || 0), 0) / totalCalls || 0;
    const totalCost = parseFloat(costMetrics.total_cost || 0);
    const costPerConversion = successfulCalls > 0 ? totalCost / successfulCalls : 0;
    
    return {
      summary: {
        totalLeads,
        totalCalls,
        successfulCalls,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgCallDuration: Math.round(avgCallDuration),
        totalCost: Math.round(totalCost * 100) / 100,
        costPerConversion: Math.round(costPerConversion * 100) / 100
      },
      analytics: analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics: callMetrics.slice(0, 50), // Last 50 calls
      period: `${days} days`,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ANALYTICS DASHBOARD ERROR]', error);
    return null;
  }
}

export async function generateAnalyticsReport(clientKey, reportType = 'comprehensive', days = 30) {
  try {
    const dashboard = await getAnalyticsDashboard(clientKey, days);
    if (!dashboard) return null;
    
    const { summary, conversionFunnel, conversionRates, performanceMetrics, costMetrics } = dashboard;
    
    // Generate insights
    const insights = [];
    
    if (summary.conversionRate < 10) {
      insights.push({
        type: 'warning',
        category: 'conversion',
        message: `Low conversion rate (${summary.conversionRate}%). Consider optimizing assistant prompts or call timing.`
      });
    }
    
    if (summary.costPerConversion > 5) {
      insights.push({
        type: 'warning',
        category: 'cost',
        message: `High cost per conversion ($${summary.costPerConversion}). Review call duration and assistant efficiency.`
      });
    }
    
    if (summary.avgCallDuration > 300) {
      insights.push({
        type: 'info',
        category: 'efficiency',
        message: `Average call duration is ${Math.round(summary.avgCallDuration / 60)} minutes. Consider optimizing for shorter, more focused calls.`
      });
    }
    
    // Find conversion bottlenecks
    const funnelStages = conversionFunnel.map(stage => ({
      stage: stage.stage,
      leads: stage.unique_leads,
      conversionRate: stage.unique_leads / summary.totalLeads * 100
    }));
    
    const bottleneckStage = funnelStages.reduce((min, stage) => 
      stage.conversionRate < min.conversionRate ? stage : min
    );
    
    if (bottleneckStage.conversionRate < 50) {
      insights.push({
        type: 'recommendation',
        category: 'optimization',
        message: `Conversion bottleneck detected at "${bottleneckStage.stage}" stage (${Math.round(bottleneckStage.conversionRate)}%). Focus optimization efforts here.`
      });
    }
    
    return {
      reportType,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      clientKey,
      summary,
      insights,
      funnelStages,
      recommendations: generateRecommendations(summary, insights),
      data: {
        conversionFunnel,
        conversionRates,
        performanceMetrics,
        costMetrics
      }
    };
  } catch (error) {
    console.error('[ANALYTICS REPORT ERROR]', error);
    return null;
  }
}

export function generateRecommendations(summary, insights) {
  const recommendations = [];
  
  if (summary.conversionRate < 15) {
    recommendations.push({
      priority: 'high',
      category: 'conversion_optimization',
      action: 'Optimize Assistant Prompts',
      description: 'Review and improve assistant conversation flow to increase conversion rates',
      expectedImpact: 'Increase conversion rate by 5-10%'
    });
  }
  
  if (summary.costPerConversion > 3) {
    recommendations.push({
      priority: 'medium',
      category: 'cost_optimization',
      action: 'Implement Call Scheduling',
      description: 'Use intelligent call scheduling to reduce costs and improve timing',
      expectedImpact: 'Reduce cost per conversion by 20-30%'
    });
  }
  
  if (summary.avgCallDuration > 240) {
    recommendations.push({
      priority: 'medium',
      category: 'efficiency',
      action: 'Streamline Call Process',
      description: 'Optimize call flow to reduce average duration while maintaining quality',
      expectedImpact: 'Reduce call duration by 15-25%'
    });
  }
  
  return recommendations;
}

// A/B Testing functions
export async function createABTestExperiment({ clientKey, experimentName, variants, isActive = true }) {
  try {
    const { createABTestExperiment } = await import('../db.js');
    
    const experiments = [];
    for (const variant of variants) {
      const experiment = await createABTestExperiment({
        clientKey,
        experimentName,
        variantName: variant.name,
        variantConfig: variant.config,
        isActive
      });
      experiments.push(experiment);
    }
    
    console.log('[AB TEST CREATED]', {
      clientKey,
      experimentName,
      variants: variants.length,
      isActive
    });
    
    return experiments;
  } catch (error) {
    console.error('[AB TEST CREATION ERROR]', error);
    throw error;
  }
}

export async function getActiveABTests(clientKey) {
  try {
    const { getActiveABTests } = await import('../db.js');
    return await getActiveABTests(clientKey);
  } catch (error) {
    console.error('[AB TEST FETCH ERROR]', error);
    return [];
  }
}

export async function selectABTestVariant(clientKey, experimentName, leadPhone) {
  const { selectABTestVariantForLead } = await import('./lib/outbound-ab-variant.js');
  return selectABTestVariantForLead(clientKey, experimentName, leadPhone);
}

export async function recordABTestOutcome(params) {
  const { recordABTestOutcome: recordInDb } = await import('../db.js');
  return recordInDb(params);
}

export async function getABTestResults(clientKey, experimentName) {
  try {
    const { getActiveABTests, getABTestConversionRates } = await import('../db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experiment = activeTests.find(test => test.experiment_name === experimentName);
    
    if (!experiment) {
      return null;
    }
    
    const conversionRates = await getABTestConversionRates(experiment.id);
    
    return {
      experiment,
      conversionRates,
      summary: {
        totalVariants: conversionRates.length,
        totalParticipants: conversionRates.reduce((sum, variant) => sum + variant.total_leads, 0),
        totalConversions: conversionRates.reduce((sum, variant) => sum + variant.converted_leads, 0),
        overallConversionRate: conversionRates.length > 0 ? 
          conversionRates.reduce((sum, variant) => sum + variant.conversion_rate, 0) / conversionRates.length : 0
      }
    };
  } catch (error) {
    console.error('[AB TEST RESULTS ERROR]', error);
    return null;
  }
}

// Performance optimization functions (using imported cache from lib/cache.js)
// Old cache code removed - now using centralized cache system
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCacheKey(prefix, ...params) {
  return `${prefix}:${params.join(':')}`;
}

export async function getCached(key) {
  // Use centralized cache system from lib/cache.js
  return await cache.get(key);
}

export async function setCache(key, data, ttl = CACHE_TTL) {
  // Use centralized cache system from lib/cache.js
  await cache.set(key, data, ttl);
}

export function clearCache(pattern = null) {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// Cached client lookup
export async function getCachedClient(tenantKey) {
  const cacheKey = getCacheKey('client', tenantKey);
  let client = await getCached(cacheKey);

  if (!client) {
    client = await getFullClient(tenantKey);
    if (client) {
      await setCache(cacheKey, client, 2 * 60 * 1000); // 2 minutes cache
    }
  }
  
  return client;
}

// Cached analytics dashboard
export async function getCachedAnalyticsDashboard(clientKey, days = 30) {
  const cacheKey = getCacheKey('analytics', clientKey, days.toString());
  let dashboard = await getCached(cacheKey);
  
  if (!dashboard) {
    dashboard = await getAnalyticsDashboard(clientKey, days);
    if (dashboard) {
      await setCache(cacheKey, dashboard, 1 * 60 * 1000); // 1 minute cache
    }
  }
  
  return dashboard;
}

// Cached metrics
export async function getCachedMetrics(clientKey) {
  const cacheKey = getCacheKey('metrics', clientKey);
  let metrics = await getCached(cacheKey);

  if (!metrics) {
    const { getTotalCostsByTenant, getCallsByTenant } = await import('../db.js');
    
    const [costMetrics, callMetrics] = await Promise.all([
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 100)
    ]);
    
    metrics = {
      costMetrics,
      callMetrics,
      lastUpdated: new Date().toISOString()
    };
    
    await setCache(cacheKey, metrics, 30 * 1000); // 30 seconds cache
  }
  
  return metrics;
}

// Batch processing for analytics
export const analyticsQueue = [];
export let analyticsProcessing = false;

export async function queueAnalyticsEvent(event) {
  analyticsQueue.push({
    ...event,
    timestamp: Date.now()
  });
  
  if (!analyticsProcessing) {
    processAnalyticsQueue();
  }
}

export async function processAnalyticsQueue() {
  if (analyticsProcessing || analyticsQueue.length === 0) {
    return;
  }
  
  analyticsProcessing = true;
  
  try {
    const batchSize = Math.min(50, analyticsQueue.length);
    const batch = analyticsQueue.splice(0, batchSize);
    
    const { trackAnalyticsEvent } = await import('../db.js');
    
    await Promise.all(batch.map(event => 
      trackAnalyticsEvent(event).catch(error => 
        console.error('[BATCH ANALYTICS ERROR]', error)
      )
    ));
    
    console.log('[ANALYTICS BATCH PROCESSED]', { 
      processed: batch.length, 
      remaining: analyticsQueue.length 
    });
  } catch (error) {
    console.error('[ANALYTICS QUEUE PROCESSING ERROR]', error);
  } finally {
    analyticsProcessing = false;
    
    // Process remaining items after a short delay
    if (analyticsQueue.length > 0) {
      setTimeout(processAnalyticsQueue, 1000);
    }
  }
}

// Connection pooling optimization
export const connectionPool = new Map();

export function getConnectionPoolKey(tenantKey) {
  return `pool_${tenantKey}`;
}

export async function optimizeDatabaseConnections() {
  try {
    // Clean up old connections
    for (const [key, connection] of connectionPool.entries()) {
      if (Date.now() - connection.lastUsed > 10 * 60 * 1000) { // 10 minutes
        connectionPool.delete(key);
      }
    }
    
    console.log('[CONNECTION POOL OPTIMIZED]', { 
      activeConnections: connectionPool.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CONNECTION POOL OPTIMIZATION ERROR]', error);
  }
}
