import path from 'path';
import { sqlHoursAgo as sqlHoursAgoFn, sqlDaysAgo as sqlDaysAgoFn } from '../lib/sql-relative-interval.js';

/**
 * Pure boot-time config derived from env + stable constants (paths, DB flavor, Google/Twilio env).
 * Must stay side-effect free except for optional Google JSON parse logging (same as legacy server.js).
 *
 * @param {string} projectRootDir — directory containing `data/` (typically __dirname of server.js)
 */
export function createRuntimeConfig(projectRootDir) {
  const DATA_DIR = path.join(projectRootDir, 'data');
  const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
  const CALLS_PATH = path.join(DATA_DIR, 'calls.json');
  const SMS_STATUS_PATH = path.join(DATA_DIR, 'sms-status.json');
  const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');

  const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';
  const sqlHoursAgo = (hours = 1) => sqlHoursAgoFn(isPostgres, hours);
  const sqlDaysAgo = (days = 1) => sqlDaysAgoFn(isPostgres, days);
  const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

  // === Env: Google — support both individual env vars AND full JSON base64
  let GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
  let GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || '';
  let GOOGLE_PRIVATE_KEY_B64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';

  if (process.env.GOOGLE_SA_JSON_BASE64 && !GOOGLE_CLIENT_EMAIL) {
    try {
      const jsonString = Buffer.from(process.env.GOOGLE_SA_JSON_BASE64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(jsonString);
      GOOGLE_CLIENT_EMAIL = serviceAccount.client_email || '';
      GOOGLE_PRIVATE_KEY = serviceAccount.private_key || '';
      console.log('[GOOGLE AUTH] ✅ Using credentials from GOOGLE_SA_JSON_BASE64');
    } catch (e) {
      console.error('[GOOGLE AUTH] ❌ Failed to parse GOOGLE_SA_JSON_BASE64:', e.message);
    }
  }

  const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const DASHBOARD_CACHE_TTL = 60000; // 60 seconds
  const dashboardStatsCache = new Map();

  /** Rolling activity windows & touchpoint day buckets on the client dashboard (GMT/BST). */
  const DASHBOARD_ACTIVITY_TZ = 'Europe/London';

  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
  const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
  const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';

  return {
    DATA_DIR,
    LEADS_PATH,
    CALLS_PATH,
    SMS_STATUS_PATH,
    JOBS_PATH,
    isPostgres,
    sqlHoursAgo,
    sqlDaysAgo,
    TIMEZONE,
    GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    GOOGLE_PRIVATE_KEY_B64,
    GOOGLE_CALENDAR_ID,
    DASHBOARD_CACHE_TTL,
    dashboardStatsCache,
    DASHBOARD_ACTIVITY_TZ,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    TWILIO_MESSAGING_SERVICE_SID,
  };
}
