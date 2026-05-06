export function startServer({
  server,
  io,
  DB_PATH,
  bookingSystem,
  smsEmailPipeline,
  initDb,
  runMigrations,
  bootstrapClients,
  registerScheduledJobs,
  scheduledJobsDeps,
}) {
  return async function start() {
    await initDb();

    if (runMigrations) {
      try {
        const migrationResult = await runMigrations();
        if (migrationResult?.applied > 0) {
          console.log(`✅ Applied ${migrationResult.applied} new migrations`);
        }
      } catch (migrationError) {
        const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
        if (isProd) {
          console.error(
            '❌ Migration failed in production — refusing to start:',
            migrationError?.message || migrationError
          );
          process.exit(1);
        }
        console.warn('⚠️ Migration failed, but continuing server startup:', migrationError?.message || migrationError);
      }
    }

    // Bootstrap clients after DB is ready
    await bootstrapClients();

    const port = process.env.PORT ? Number(process.env.PORT) : 10000;
    server.listen(port, '0.0.0.0', () => {
      console.log(`AI Booking System listening on http://localhost:${process.env.PORT || 10000} (DB: ${DB_PATH})`);
      console.log(`Security middleware: Enhanced authentication and rate limiting enabled`);
      console.log(`Booking system: ${bookingSystem ? 'Available' : 'Not Available'}`);
      console.log(`SMS-Email pipeline: ${smsEmailPipeline ? 'Available' : 'Not Available'}`);
      console.log(`WebSocket server: Real-time Admin Hub updates enabled`);
    });

    // Set server timeout to 25 minutes to handle comprehensive searches
    server.timeout = 1500000; // 25 minutes

    // Register all scheduled jobs (crons + reminder setInterval)
    return registerScheduledJobs(scheduledJobsDeps);
  };
}

