/**
 * Env validation, migrations, HTTP listen, scheduled jobs registration.
 * Extracted from server.js to keep the entry file thin.
 */
export async function runStartServer({
  createStartServer,
  validateEnvironment,
  runMigrations,
  registerScheduledJobs,
  server,
  io,
  DB_PATH,
  bookingSystem,
  smsEmailPipeline,
  initDb,
  bootstrapClients,
  buildScheduledJobsDeps,
  processCallQueue,
  processRetryQueue,
  queueNewLeadsForCalling,
  sendScheduledReminders,
}) {
  validateEnvironment();

  const start = createStartServer({
    server,
    io,
    DB_PATH,
    bookingSystem,
    smsEmailPipeline,
    initDb,
    runMigrations,
    bootstrapClients,
    registerScheduledJobs,
    scheduledJobsDeps: buildScheduledJobsDeps({
      processCallQueue,
      processRetryQueue,
      queueNewLeadsForCalling,
      sendScheduledReminders,
    }),
  });

  return start();
}
