// tests/fixtures/mock-cron-triggers.js
// Mock cron job triggers for testing

export function mockCronTrigger(jobName) {
  const triggers = {
    qualityMonitoring: {
      name: 'quality-monitoring',
      schedule: '0 * * * *', // Every hour
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 60 * 60 * 1000)
    },
    
    appointmentReminders: {
      name: 'appointment-reminders',
      schedule: '*/5 * * * *', // Every 5 minutes
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 5 * 60 * 1000)
    },
    
    followupMessages: {
      name: 'followup-messages',
      schedule: '*/5 * * * *', // Every 5 minutes
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 5 * 60 * 1000)
    },
    
    databaseHealth: {
      name: 'database-health',
      schedule: '*/5 * * * *', // Every 5 minutes
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 5 * 60 * 1000)
    },
    
    weeklyReports: {
      name: 'weekly-reports',
      schedule: '0 9 * * 1', // Monday 9am
      lastRun: new Date(),
      nextRun: getNextMonday()
    },
    
    databaseOptimization: {
      name: 'database-optimization',
      schedule: '*/5 * * * *', // Every 5 minutes
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 5 * 60 * 1000)
    }
  };
  
  return triggers[jobName] || null;
}

function getNextMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() + (day === 0 ? 1 : 8 - day);
  const nextMonday = new Date(date.setDate(diff));
  nextMonday.setHours(9, 0, 0, 0);
  return nextMonday;
}

export const cronJobs = [
  'qualityMonitoring',
  'appointmentReminders',
  'followupMessages',
  'databaseHealth',
  'weeklyReports',
  'databaseOptimization'
];

