// Monitoring & Observability System
// Provides comprehensive monitoring, alerting, and health checks

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

/**
 * Metrics Collector
 */
export class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byEndpoint: new Map(),
        byStatusCode: new Map(),
        responseTimes: []
      },
      database: {
        queries: 0,
        slowQueries: 0,
        errors: 0,
        connectionPool: {
          active: 0,
          idle: 0,
          waiting: 0
        }
      },
      external: {
        vapi: { calls: 0, errors: 0, avgDuration: 0 },
        twilio: { messages: 0, errors: 0 },
        google: { calendarEvents: 0, errors: 0 }
      },
      system: {
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { usage: 0 },
        uptime: 0
      }
    };
    
    this.startTime = Date.now();
    this.startCollection();
  }

  startCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Clean up old response times every minute
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 60000);
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    
    this.metrics.system.memory = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / totalMem) * 100)
    };

    this.metrics.system.uptime = Math.round((Date.now() - this.startTime) / 1000);

    // Emit metrics update event
    this.emit('metricsUpdate', this.metrics);
  }

  trackRequest(endpoint, method, statusCode, duration) {
    this.metrics.requests.total++;
    
    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Track by endpoint
    const endpointKey = `${method} ${endpoint}`;
    const endpointMetrics = this.metrics.requests.byEndpoint.get(endpointKey) || {
      total: 0,
      successful: 0,
      failed: 0,
      avgDuration: 0,
      durations: []
    };
    
    endpointMetrics.total++;
    endpointMetrics.durations.push(duration);
    endpointMetrics.avgDuration = endpointMetrics.durations.reduce((a, b) => a + b, 0) / endpointMetrics.durations.length;
    
    if (statusCode >= 200 && statusCode < 400) {
      endpointMetrics.successful++;
    } else {
      endpointMetrics.failed++;
    }
    
    this.metrics.requests.byEndpoint.set(endpointKey, endpointMetrics);

    // Track by status code
    const statusCount = this.metrics.requests.byStatusCode.get(statusCode) || 0;
    this.metrics.requests.byStatusCode.set(statusCode, statusCount + 1);

    // Track response times (keep last 1000)
    this.metrics.requests.responseTimes.push(duration);
    if (this.metrics.requests.responseTimes.length > 1000) {
      this.metrics.requests.responseTimes.shift();
    }
  }

  trackDatabaseQuery(duration, error = null) {
    this.metrics.database.queries++;
    
    if (duration > 1000) {
      this.metrics.database.slowQueries++;
    }
    
    if (error) {
      this.metrics.database.errors++;
    }
  }

  trackExternalService(service, operation, duration, error = null) {
    if (!this.metrics.external[service]) {
      this.metrics.external[service] = { calls: 0, errors: 0, avgDuration: 0 };
    }

    this.metrics.external[service].calls++;
    
    if (error) {
      this.metrics.external[service].errors++;
    }

    // Update average duration
    const currentAvg = this.metrics.external[service].avgDuration;
    const totalCalls = this.metrics.external[service].calls;
    this.metrics.external[service].avgDuration = 
      (currentAvg * (totalCalls - 1) + duration) / totalCalls;
  }

  cleanupOldMetrics() {
    // Keep only last hour of response times
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    // This would be implemented based on your timestamp tracking
  }

  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      uptime: this.metrics.system.uptime
    };
  }

  getHealthScore() {
    const totalRequests = this.metrics.requests.total;
    const successRate = totalRequests > 0 ? (this.metrics.requests.successful / totalRequests) * 100 : 100;
    
    const avgResponseTime = this.metrics.requests.responseTimes.length > 0
      ? this.metrics.requests.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.requests.responseTimes.length
      : 0;
    
    const responseTimeScore = avgResponseTime < 200 ? 100 : Math.max(0, 100 - (avgResponseTime - 200) / 10);
    
    const errorRate = totalRequests > 0 ? (this.metrics.requests.failed / totalRequests) * 100 : 0;
    const errorScore = Math.max(0, 100 - errorRate * 2);
    
    const memoryScore = Math.max(0, 100 - this.metrics.system.memory.percentage);
    
    return {
      overall: Math.round((successRate + responseTimeScore + errorScore + memoryScore) / 4),
      successRate: Math.round(successRate),
      responseTimeScore: Math.round(responseTimeScore),
      errorScore: Math.round(errorScore),
      memoryScore: Math.round(memoryScore),
      avgResponseTime: Math.round(avgResponseTime)
    };
  }
}

/**
 * Alert Manager
 */
export class AlertManager extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.thresholds = {
      errorRate: 5, // 5% error rate threshold
      responseTime: 1000, // 1 second response time threshold
      memoryUsage: 80, // 80% memory usage threshold
      slowQueries: 10 // 10 slow queries per minute threshold
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Check thresholds every 30 seconds
    setInterval(() => {
      this.checkThresholds();
    }, 30000);
  }

  checkThresholds() {
    // This would integrate with your metrics collector
    // For now, we'll provide the structure
  }

  triggerAlert(type, message, severity = 'warning', data = {}) {
    const alert = {
      id: createHash('md5').update(`${type}-${message}-${Date.now()}`).digest('hex'),
      type,
      message,
      severity,
      data,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);

    // Log alert
    console.warn(`[ALERT ${severity.toUpperCase()}] ${type}: ${message}`, data);

    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
      this.emit('alertAcknowledged', alert);
    }
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  getAlertsByType(type) {
    return Array.from(this.alerts.values()).filter(alert => alert.type === type);
  }
}

/**
 * Health Check Manager
 */
export class HealthCheckManager {
  constructor() {
    this.checks = new Map();
    this.status = new Map();
  }

  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      interval: options.interval || 30000,
      timeout: options.timeout || 5000,
      critical: options.critical || false
    });
  }

  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) return;

    const startTime = Date.now();
    
    try {
      await Promise.race([
        check.fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      this.status.set(name, {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        duration,
        critical: check.critical
      });
    } catch (error) {
      this.status.set(name, {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: error.message,
        critical: check.critical
      });
    }
  }

  start() {
    this.checks.forEach((check, name) => {
      this.runCheck(name);
      setInterval(() => this.runCheck(name), check.interval);
    });
  }

  getOverallHealth() {
    const checks = Array.from(this.status.values());
    const healthyCount = checks.filter(c => c.status === 'healthy').length;
    const criticalUnhealthy = checks.filter(c => c.critical && c.status === 'unhealthy').length;
    
    return {
      status: criticalUnhealthy > 0 ? 'critical' : 
              healthyCount === checks.length ? 'healthy' : 'degraded',
      healthyCount,
      totalCount: checks.length,
      criticalIssues: criticalUnhealthy,
      checks: Array.from(this.status.entries()).map(([name, status]) => ({
        name,
        ...status
      }))
    };
  }
}

/**
 * Log Aggregator
 */
export class LogAggregator {
  constructor() {
    this.logs = [];
    this.maxLogs = 10000;
  }

  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      id: createHash('md5').update(`${level}-${message}-${Date.now()}`).digest('hex')
    };

    this.logs.push(logEntry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    const logMessage = `[${level.toUpperCase()}] ${message}`;
    switch (level) {
      case 'error':
        console.error(logMessage, context);
        break;
      case 'warn':
        console.warn(logMessage, context);
        break;
      case 'info':
        console.info(logMessage, context);
        break;
      default:
        console.log(logMessage, context);
    }
  }

  getLogs(filters = {}) {
    let filtered = [...this.logs];

    if (filters.level) {
      filtered = filtered.filter(log => log.level === filters.level);
    }

    if (filters.since) {
      const since = new Date(filters.since);
      filtered = filtered.filter(log => new Date(log.timestamp) >= since);
    }

    if (filters.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered;
  }

  getLogStats() {
    const levels = ['error', 'warn', 'info', 'debug'];
    const stats = {};
    
    levels.forEach(level => {
      stats[level] = this.logs.filter(log => log.level === level).length;
    });

    return {
      total: this.logs.length,
      byLevel: stats,
      lastLog: this.logs[this.logs.length - 1]?.timestamp
    };
  }
}

// Singleton instances
let metricsCollector = null;
let alertManager = null;
let healthCheckManager = null;
let logAggregator = null;

export function getMetricsCollector() {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector();
  }
  return metricsCollector;
}

export function getAlertManager() {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}

export function getHealthCheckManager() {
  if (!healthCheckManager) {
    healthCheckManager = new HealthCheckManager();
  }
  return healthCheckManager;
}

export function getLogAggregator() {
  if (!logAggregator) {
    logAggregator = new LogAggregator();
  }
  return logAggregator;
}

export default {
  MetricsCollector,
  AlertManager,
  HealthCheckManager,
  LogAggregator,
  getMetricsCollector,
  getAlertManager,
  getHealthCheckManager,
  getLogAggregator
};



