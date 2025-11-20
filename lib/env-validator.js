// lib/env-validator.js
// Environment variable validation on startup

export function validateEnvironment() {
  const required = {
    // Critical - Server won't work without these
    DATABASE_URL: { description: 'Database connection', critical: true },
    API_KEY: { description: 'Admin API key', critical: true },
    
    // Important - Core features won't work
    VAPI_PRIVATE_KEY: { description: 'Vapi AI calling', critical: false, feature: 'AI calling' },
    VAPI_ASSISTANT_ID: { description: 'Vapi assistant ID', critical: false, feature: 'AI calling' },
    GOOGLE_CLIENT_EMAIL: { description: 'Google Calendar', critical: false, feature: 'Appointment booking' },
    GOOGLE_PRIVATE_KEY: { description: 'Google Calendar key', critical: false, feature: 'Appointment booking' },
    GOOGLE_CALENDAR_ID: { description: 'Google Calendar ID', critical: false, feature: 'Appointment booking' },
    
    // Optional - Nice to have
    TWILIO_ACCOUNT_SID: { description: 'Twilio SMS', critical: false, feature: 'SMS notifications' },
    TWILIO_AUTH_TOKEN: { description: 'Twilio auth', critical: false, feature: 'SMS notifications' },
    EMAIL_USER: { description: 'Email service', critical: false, feature: 'Email notifications' },
    EMAIL_PASS: { description: 'Email password', critical: false, feature: 'Email notifications' }
  };
  
  const missing = [];
  const warnings = [];
  const info = [];
  
  for (const [key, config] of Object.entries(required)) {
    // Special handling: GOOGLE_PRIVATE_KEY can be provided via GOOGLE_SA_JSON_BASE64
    if (key === 'GOOGLE_PRIVATE_KEY' && !process.env[key]) {
      if (process.env.GOOGLE_SA_JSON_BASE64 || process.env.GOOGLE_PRIVATE_KEY_B64) {
        // Private key is available via alternative format, skip warning
        continue;
      }
    }
    
    if (!process.env[key]) {
      if (config.critical) {
        missing.push(`❌ ${key} - ${config.description} (REQUIRED)`);
      } else {
        warnings.push({
          key,
          description: config.description,
          feature: config.feature
        });
      }
    } else {
      info.push(`✅ ${key} - ${config.description}`);
    }
  }
  
  // Print info messages
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('\n[ENV VALIDATION] Configured variables:');
    info.forEach(i => console.log(i));
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.warn('\n[ENV VALIDATION] ⚠️ Optional features disabled:');
    const grouped = {};
    warnings.forEach(w => {
      if (!grouped[w.feature]) grouped[w.feature] = [];
      grouped[w.feature].push(w.key);
    });
    
    for (const [feature, keys] of Object.entries(grouped)) {
      console.warn(`  - ${feature}: Missing ${keys.join(', ')}`);
    }
    console.warn('  System will start but some features will be unavailable.\n');
  }
  
  // Fail if critical vars missing
  if (missing.length > 0) {
    console.error('\n[ENV VALIDATION] 🚨 Missing CRITICAL environment variables:');
    missing.forEach(m => console.error(`  ${m}`));
    console.error('\nServer cannot start without these variables.');
    console.error('Please set them in your .env file or environment.\n');
    throw new Error('Missing required environment variables');
  }
  
  console.log('✅ Environment validation passed\n');
  
  return {
    valid: true,
    warnings: warnings.length,
    configured: info.length
  };
}

export default validateEnvironment;

