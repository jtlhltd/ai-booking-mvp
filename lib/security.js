// Security Utilities
// Provides encryption, audit logging, and security features

import crypto from 'crypto';
import { EventEmitter } from 'events';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Encryption utility for sensitive data
 */
export class Encryption {
  /**
   * Encrypt sensitive data
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text with IV and auth tag
   */
  static encrypt(text) {
    if (!text) return null;

    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return IV:AuthTag:EncryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedText - Encrypted text with IV and auth tag
   * @returns {string} Decrypted text
   */
  static decrypt(encryptedText) {
    if (!encryptedText) return null;

    try {
      const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
      const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[ENCRYPTION] Decryption failed:', error.message);
      return null;
    }
  }

  /**
   * Hash password with salt
   * @param {string} password - Plain password
   * @returns {string} Hashed password with salt
   */
  static hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify password
   * @param {string} password - Plain password
   * @param {string} hashedPassword - Hashed password with salt
   * @returns {boolean} True if password matches
   */
  static verifyPassword(password, hashedPassword) {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  /**
   * Generate secure random token
   * @param {number} bytes - Number of bytes (default 32)
   * @returns {string} Hex token
   */
  static generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }
}

/**
 * Audit Logger
 * Tracks all user actions for compliance
 */
export class AuditLogger extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.maxLogs = 10000;
  }

  /**
   * Log user action
   * @param {Object} params - Action parameters
   */
  log({ userId, clientKey, action, resource, details, ip, userAgent, success = true }) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId,
      clientKey,
      action,
      resource,
      details,
      ip,
      userAgent,
      success
    };

    this.logs.push(entry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Emit event for real-time monitoring
    this.emit('audit', entry);

    // Log to console
    console.log(`[AUDIT] ${action} by ${userId || 'anonymous'} on ${resource} - ${success ? 'SUCCESS' : 'FAILED'}`);

    return entry;
  }

  /**
   * Get audit logs with filtering
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered logs
   */
  getLogs(filters = {}) {
    let filtered = [...this.logs];

    if (filters.userId) {
      filtered = filtered.filter(log => log.userId === filters.userId);
    }

    if (filters.clientKey) {
      filtered = filtered.filter(log => log.clientKey === filters.clientKey);
    }

    if (filters.action) {
      filtered = filtered.filter(log => log.action === filters.action);
    }

    if (filters.resource) {
      filtered = filtered.filter(log => log.resource === filters.resource);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      filtered = filtered.filter(log => new Date(log.timestamp) >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      filtered = filtered.filter(log => new Date(log.timestamp) <= end);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filters.limit ? filtered.slice(0, filters.limit) : filtered;
  }

  /**
   * Export logs for compliance
   * @param {Object} filters - Filter criteria
   * @returns {string} CSV formatted logs
   */
  exportLogs(filters = {}) {
    const logs = this.getLogs(filters);
    
    const headers = ['Timestamp', 'User ID', 'Client Key', 'Action', 'Resource', 'Details', 'IP', 'Success'];
    const rows = logs.map(log => [
      log.timestamp,
      log.userId || '',
      log.clientKey || '',
      log.action,
      log.resource || '',
      JSON.stringify(log.details || {}),
      log.ip || '',
      log.success ? 'Yes' : 'No'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }

  /**
   * Detect anomalous behavior
   * @param {string} userId - User ID to check
   * @returns {Array} Detected anomalies
   */
  detectAnomalies(userId) {
    const userLogs = this.getLogs({ userId, limit: 100 });
    const anomalies = [];

    // Check for rapid requests (possible automation/attack)
    const recentLogs = userLogs.filter(log => {
      const logTime = new Date(log.timestamp);
      return Date.now() - logTime.getTime() < 60000; // Last minute
    });

    if (recentLogs.length > 30) {
      anomalies.push({
        type: 'rapid_requests',
        severity: 'high',
        message: `${recentLogs.length} requests in last minute`,
        recommendation: 'Possible automation or attack - consider rate limiting'
      });
    }

    // Check for failed login attempts
    const failedLogins = userLogs.filter(log => 
      log.action === 'login' && !log.success
    ).slice(0, 10);

    if (failedLogins.length >= 5) {
      anomalies.push({
        type: 'failed_logins',
        severity: 'critical',
        message: `${failedLogins.length} failed login attempts`,
        recommendation: 'Possible brute force attack - lock account temporarily'
      });
    }

    // Check for unusual IP changes
    const recentIPs = [...new Set(userLogs.slice(0, 10).map(log => log.ip))];
    if (recentIPs.length > 3) {
      anomalies.push({
        type: 'ip_variation',
        severity: 'medium',
        message: `Access from ${recentIPs.length} different IPs recently`,
        recommendation: 'Possible account compromise - verify user identity'
      });
    }

    return anomalies;
  }
}

/**
 * GDPR Compliance Manager
 */
export class GDPRManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Record consent
   * @param {Object} params - Consent parameters
   */
  async recordConsent({ userId, clientKey, consentType, granted, ip, userAgent }) {
    const { query } = this.db;

    await query(`
      INSERT INTO consent_records (
        user_id, client_key, consent_type, granted, ip_address, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, clientKey, consentType, granted, ip, userAgent, new Date()]);

    console.log(`[GDPR] Consent recorded: ${consentType} = ${granted} for user ${userId}`);

    return true;
  }

  /**
   * Get user's consent status
   * @param {string} userId - User ID
   * @returns {Object} Consent status
   */
  async getConsent(userId) {
    const { query } = this.db;

    const result = await query(`
      SELECT consent_type, granted, created_at
      FROM consent_records
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const consent = {};
    result.rows.forEach(row => {
      if (!consent[row.consent_type]) {
        consent[row.consent_type] = {
          granted: row.granted,
          date: row.created_at
        };
      }
    });

    return consent;
  }

  /**
   * Export all user data (GDPR Right to Access)
   * @param {string} userId - User ID
   * @returns {Object} All user data
   */
  async exportUserData(userId) {
    const { query } = this.db;

    const data = {
      exportDate: new Date().toISOString(),
      userId
    };

    // Get user profile
    try {
      const profile = await query('SELECT * FROM user_accounts WHERE id = $1', [userId]);
      data.profile = profile.rows[0];
    } catch (e) {
      data.profile = null;
    }

    // Get leads
    try {
      const leads = await query('SELECT * FROM leads WHERE created_by = $1 OR phone = $2', [userId, userId]);
      data.leads = leads.rows;
    } catch (e) {
      data.leads = [];
    }

    // Get consent records
    try {
      const consent = await query('SELECT * FROM consent_records WHERE user_id = $1', [userId]);
      data.consent = consent.rows;
    } catch (e) {
      data.consent = [];
    }

    // Get audit logs (if available)
    data.auditLogs = auditLogger.getLogs({ userId, limit: 1000 });

    return data;
  }

  /**
   * Delete all user data (GDPR Right to be Forgotten)
   * @param {string} userId - User ID
   * @param {string} reason - Reason for deletion
   * @returns {Object} Deletion summary
   */
  async deleteUserData(userId, reason = 'User request') {
    const { query } = this.db;
    const summary = {
      userId,
      deletedAt: new Date().toISOString(),
      reason,
      itemsDeleted: {}
    };

    try {
      // Delete leads
      const leadsResult = await query('DELETE FROM leads WHERE created_by = $1 OR phone = $2 RETURNING id', [userId, userId]);
      summary.itemsDeleted.leads = leadsResult.rowCount;

      // Anonymize instead of delete (for audit trail)
      await query(`
        UPDATE user_accounts 
        SET 
          email = 'deleted@gdpr.local',
          phone = 'DELETED',
          name = 'Deleted User',
          deleted_at = $1,
          deletion_reason = $2
        WHERE id = $3
      `, [new Date(), reason, userId]);
      summary.itemsDeleted.profile = 1;

      // Keep consent records for legal compliance
      summary.itemsDeleted.consent = 0;
      summary.note = 'Consent records retained for legal compliance (6 years)';

      console.log(`[GDPR] User data deleted: ${userId}, reason: ${reason}`);

    } catch (error) {
      console.error('[GDPR] Error deleting user data:', error);
      throw error;
    }

    return summary;
  }

  /**
   * Apply data retention policy
   * @param {number} days - Days to retain data
   * @returns {Object} Deletion summary
   */
  async applyDataRetention(days = 730) {
    const { query } = this.db;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const summary = {
      appliedAt: new Date().toISOString(),
      retentionDays: days,
      cutoffDate: cutoffDate.toISOString(),
      itemsDeleted: {}
    };

    try {
      // Delete old leads
      const leadsResult = await query(
        'DELETE FROM leads WHERE created_at < $1 AND status IN ($2, $3) RETURNING id',
        [cutoffDate, 'not_interested', 'completed']
      );
      summary.itemsDeleted.leads = leadsResult.rowCount;

      // Delete old audit logs (keep critical events longer)
      // This would be implemented based on audit log storage

      console.log(`[GDPR] Data retention applied: ${summary.itemsDeleted.leads} old leads deleted`);

    } catch (error) {
      console.error('[GDPR] Error applying data retention:', error);
      throw error;
    }

    return summary;
  }
}

/**
 * IP Whitelisting
 */
export class IPWhitelist {
  constructor() {
    this.whitelist = new Set();
    this.blacklist = new Set();
  }

  /**
   * Add IP to whitelist
   * @param {string} ip - IP address
   */
  addToWhitelist(ip) {
    this.whitelist.add(ip);
    console.log(`[SECURITY] IP added to whitelist: ${ip}`);
  }

  /**
   * Add IP to blacklist
   * @param {string} ip - IP address
   */
  addToBlacklist(ip) {
    this.blacklist.add(ip);
    console.log(`[SECURITY] IP added to blacklist: ${ip}`);
  }

  /**
   * Check if IP is allowed
   * @param {string} ip - IP address
   * @returns {boolean} True if allowed
   */
  isAllowed(ip) {
    // If IP is blacklisted, deny
    if (this.blacklist.has(ip)) {
      return false;
    }

    // If whitelist is empty, allow all (except blacklisted)
    if (this.whitelist.size === 0) {
      return true;
    }

    // If whitelist is not empty, only allow whitelisted IPs
    return this.whitelist.has(ip);
  }

  /**
   * Express middleware for IP filtering
   */
  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;

      if (!this.isAllowed(ip)) {
        console.warn(`[SECURITY] Blocked request from IP: ${ip}`);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP address is not allowed to access this resource'
        });
      }

      next();
    };
  }
}

// Singleton instances
let auditLogger = null;
let ipWhitelist = null;

export function getAuditLogger() {
  if (!auditLogger) {
    auditLogger = new AuditLogger();
  }
  return auditLogger;
}

export function getIPWhitelist() {
  if (!ipWhitelist) {
    ipWhitelist = new IPWhitelist();
  }
  return ipWhitelist;
}

export default {
  Encryption,
  AuditLogger,
  GDPRManager,
  IPWhitelist,
  getAuditLogger,
  getIPWhitelist
};
