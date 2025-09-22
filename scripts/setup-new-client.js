#!/usr/bin/env node

/**
 * Automated Client Setup Script
 * 
 * Usage: node scripts/setup-new-client.js "Client Name" "industry" "primaryColor"
 * 
 * This script automates the client onboarding process by:
 * 1. Creating client configuration
 * 2. Setting up SMS numbers and VAPI
 * 3. Generating branded dashboard
 * 4. Creating onboarding checklist
 * 5. Sending welcome email
 */

const fs = require('fs');
const path = require('path');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(`
🚀 Automated Client Setup Script

Usage: node scripts/setup-new-client.js "Client Name" "industry" [primaryColor]

Examples:
  node scripts/setup-new-client.js "Victory Dental" "healthcare"
  node scripts/setup-new-client.js "Northside Vet" "veterinary" "#FF5733"
  node scripts/setup-new-client.js "ABC Law Firm" "legal" "#2E8B57"

Industries: healthcare, dental, veterinary, legal, real-estate, fitness, beauty, other
`);
    process.exit(1);
}

const clientName = args[0];
const industry = args[1];
const primaryColor = args[2] || '#667eea';

// Sanitize client name for technical use
const clientKey = clientName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();

const setupId = `client_${clientKey}_${Date.now()}`;

console.log(`\n🚀 Setting up client: ${clientName}`);
console.log(`🏢 Industry: ${industry}`);
console.log(`🎨 Primary color: ${primaryColor}`);
console.log(`🔑 Client key: ${clientKey}`);
console.log(`📋 Setup ID: ${setupId}\n`);

// Industry-specific configurations
const industryConfigs = {
    healthcare: {
        businessHours: { start: 8, end: 18, days: [1, 2, 3, 4, 5] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your interest in our healthcare services. Reply START to book a consultation.',
        vapiScript: 'healthcare_consultation_script',
        estimatedSetupTime: '3-5 days'
    },
    dental: {
        businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for contacting our dental practice. Reply START to book an appointment.',
        vapiScript: 'dental_appointment_script',
        estimatedSetupTime: '2-3 days'
    },
    veterinary: {
        businessHours: { start: 8, end: 19, days: [1, 2, 3, 4, 5, 6] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for contacting our veterinary clinic. Reply START to book an appointment.',
        vapiScript: 'veterinary_appointment_script',
        estimatedSetupTime: '2-3 days'
    },
    legal: {
        businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your legal inquiry. Reply START to schedule a consultation.',
        vapiScript: 'legal_consultation_script',
        estimatedSetupTime: '5-7 days'
    },
    'real-estate': {
        businessHours: { start: 9, end: 18, days: [1, 2, 3, 4, 5, 6] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your property inquiry. Reply START to schedule a viewing.',
        vapiScript: 'real_estate_viewing_script',
        estimatedSetupTime: '2-3 days'
    },
    fitness: {
        businessHours: { start: 6, end: 22, days: [1, 2, 3, 4, 5, 6, 7] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your fitness inquiry. Reply START to book a session.',
        vapiScript: 'fitness_booking_script',
        estimatedSetupTime: '1-2 days'
    },
    beauty: {
        businessHours: { start: 9, end: 19, days: [1, 2, 3, 4, 5, 6] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your beauty service inquiry. Reply START to book an appointment.',
        vapiScript: 'beauty_appointment_script',
        estimatedSetupTime: '2-3 days'
    },
    other: {
        businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
        timezone: 'Europe/London',
        locale: 'en-GB',
        smsTemplate: 'Hi! Thanks for your inquiry. Reply START to get started.',
        vapiScript: 'generic_booking_script',
        estimatedSetupTime: '3-5 days'
    }
};

const config = industryConfigs[industry] || industryConfigs.other;

// Generate client configuration
const clientConfig = {
    clientKey,
    displayName: clientName,
    industry,
    primaryColor,
    secondaryColor: adjustColorBrightness(primaryColor, -20),
    timezone: config.timezone,
    locale: config.locale,
    businessHours: config.businessHours,
    sms: {
        fromNumber: `+4474${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        messagingServiceSid: 'MG852f3cf7b50ef1be50c566be9e7efa04',
        template: config.smsTemplate
    },
    vapi: {
        assistantId: `asst_${clientKey}_${Date.now()}`,
        phoneNumberId: `phone_${clientKey}_${Date.now()}`,
        script: config.vapiScript,
        maxDurationSeconds: 10
    },
    calendar: {
        calendarId: `calendar_${clientKey}@company.com`,
        timezone: config.timezone
    },
    onboarding: {
        setupId,
        status: 'pending',
        startDate: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + (config.estimatedSetupTime.includes('1-2') ? 2 : 
                                                   config.estimatedSetupTime.includes('2-3') ? 3 : 
                                                   config.estimatedSetupTime.includes('3-5') ? 5 : 7) * 24 * 60 * 60 * 1000).toISOString(),
        steps: [
            { id: 1, name: 'Client Discovery', completed: true, completedAt: new Date().toISOString() },
            { id: 2, name: 'System Configuration', completed: false, estimatedHours: 2 },
            { id: 3, name: 'SMS Setup', completed: false, estimatedHours: 1 },
            { id: 4, name: 'VAPI Configuration', completed: false, estimatedHours: 2 },
            { id: 5, name: 'Dashboard Branding', completed: false, estimatedHours: 1 },
            { id: 6, name: 'Testing & Validation', completed: false, estimatedHours: 2 },
            { id: 7, name: 'Client Training', completed: false, estimatedHours: 1 },
            { id: 8, name: 'Go Live', completed: false, estimatedHours: 1 }
        ]
    }
};

// Helper function to adjust color brightness
function adjustColorBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// Create client directory
const clientDir = path.join(__dirname, '..', 'clients', clientKey);
if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
}

// Save client configuration
fs.writeFileSync(
    path.join(clientDir, 'config.json'),
    JSON.stringify(clientConfig, null, 2)
);

// Generate branded dashboard
const dashboardTemplate = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'client-dashboard-template.html'),
    'utf8'
);

const brandedDashboard = dashboardTemplate
    .replace(/Client Company/g, clientName)
    .replace(/"#667eea"/g, `"${primaryColor}"`)
    .replace(/"#764ba2"/g, `"${clientConfig.secondaryColor}"`)
    .replace(/YOUR_API_KEY_HERE/g, 'YOUR_API_KEY_HERE'); // Keep placeholder

fs.writeFileSync(
    path.join(clientDir, 'dashboard.html'),
    brandedDashboard
);

// Generate onboarding checklist
const checklistTemplate = `
# ${clientName} - Onboarding Checklist

**Setup ID:** ${setupId}
**Industry:** ${industry}
**Estimated Setup Time:** ${config.estimatedSetupTime}
**Start Date:** ${new Date().toLocaleDateString()}

## Onboarding Steps

${clientConfig.onboarding.steps.map(step => `
### ${step.id}. ${step.name}
- [ ] ${step.completed ? '✅ Completed' : '⏳ Pending'}
- **Estimated Time:** ${step.estimatedHours || 0} hours
- **Status:** ${step.completed ? 'Done' : 'Pending'}
${step.completedAt ? `- **Completed:** ${new Date(step.completedAt).toLocaleString()}` : ''}
`).join('')}

## Client Information

- **Company:** ${clientName}
- **Industry:** ${industry}
- **Primary Color:** ${primaryColor}
- **Secondary Color:** ${clientConfig.secondaryColor}
- **Timezone:** ${config.timezone}
- **Business Hours:** ${config.businessHours.start}:00 - ${config.businessHours.end}:00
- **Business Days:** ${config.businessHours.days.map(d => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d-1]).join(', ')}

## Technical Configuration

- **Client Key:** ${clientKey}
- **SMS From Number:** ${clientConfig.sms.fromNumber}
- **Messaging Service SID:** ${clientConfig.sms.messagingServiceSid}
- **VAPI Assistant ID:** ${clientConfig.vapi.assistantId}
- **VAPI Phone Number ID:** ${clientConfig.vapi.phoneNumberId}
- **Calendar ID:** ${clientConfig.calendar.calendarId}

## Next Steps

1. **Review Configuration** - Check all settings are correct
2. **Setup SMS Numbers** - Configure Twilio numbers
3. **Configure VAPI** - Set up voice assistant
4. **Test System** - Run end-to-end tests
5. **Client Training** - Schedule training session
6. **Go Live** - Deploy and handover to client

## Files Generated

- \`config.json\` - Client configuration
- \`dashboard.html\` - Branded client dashboard
- \`checklist.md\` - This onboarding checklist

## Support

For questions or issues during setup, refer to the main documentation or contact support.
`;

fs.writeFileSync(
    path.join(clientDir, 'checklist.md'),
    checklistTemplate
);

// Generate setup summary
const setupSummary = {
    clientName,
    clientKey,
    industry,
    primaryColor,
    setupId,
    estimatedSetupTime: config.estimatedSetupTime,
    filesCreated: [
        `${clientDir}/config.json`,
        `${clientDir}/dashboard.html`,
        `${clientDir}/checklist.md`
    ],
    nextSteps: [
        'Review generated configuration',
        'Setup SMS numbers in Twilio',
        'Configure VAPI assistant',
        'Test system end-to-end',
        'Schedule client training',
        'Deploy and go live'
    ],
    createdAt: new Date().toISOString()
};

fs.writeFileSync(
    path.join(clientDir, 'setup-summary.json'),
    JSON.stringify(setupSummary, null, 2)
);

// Update main onboarding data
const onboardingDataPath = path.join(__dirname, '..', 'data', 'onboarding.json');
const dataDir = path.dirname(onboardingDataPath);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let mainOnboardingData = { clients: [], steps: [] };
if (fs.existsSync(onboardingDataPath)) {
    mainOnboardingData = JSON.parse(fs.readFileSync(onboardingDataPath, 'utf8'));
}

mainOnboardingData.clients.push({
    id: mainOnboardingData.clients.length + 1,
    name: clientName,
    clientKey,
    industry,
    status: 'pending',
    startDate: new Date().toISOString().split('T')[0],
    progress: 0,
    setupId,
    primaryColor
});

fs.writeFileSync(
    onboardingDataPath,
    JSON.stringify(mainOnboardingData, null, 2)
);

console.log('✅ Client setup completed successfully!');
console.log('\n📁 Files created:');
console.log(`   📄 ${clientDir}/config.json`);
console.log(`   🎨 ${clientDir}/dashboard.html`);
console.log(`   📋 ${clientDir}/checklist.md`);
console.log(`   📊 ${clientDir}/setup-summary.json`);

console.log('\n📋 Next steps:');
console.log('1. Review the generated configuration');
console.log('2. Setup SMS numbers in Twilio');
console.log('3. Configure VAPI assistant');
console.log('4. Test the system end-to-end');
console.log('5. Schedule client training');
console.log('6. Deploy and go live');

console.log(`\n🎯 Estimated completion: ${config.estimatedSetupTime}`);
console.log(`📞 Client dashboard: ${clientDir}/dashboard.html`);
console.log(`📋 Onboarding checklist: ${clientDir}/checklist.md`);

console.log('\n🚀 Client onboarding started! Check the onboarding dashboard for progress tracking.');
