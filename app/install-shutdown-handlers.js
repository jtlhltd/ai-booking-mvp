export function installShutdownHandlers({
  server,
  io,
  getActiveRequests,
  stopScheduledJobs,
  closeDatabase,
}) {
  if (!server) throw new Error('installShutdownHandlers requires server');
  if (!io) throw new Error('installShutdownHandlers requires io');
  if (typeof getActiveRequests !== 'function') throw new Error('installShutdownHandlers requires getActiveRequests');
  if (typeof closeDatabase !== 'function') throw new Error('installShutdownHandlers requires closeDatabase');

  let isShuttingDown = false;
  let shutdownTimeout = null;

  async function gracefulShutdown(signal) {
    if (isShuttingDown) {
      console.log('[SHUTDOWN] Already shutting down, ignoring signal');
      return;
    }

    isShuttingDown = true;
    console.log(`\n[SHUTDOWN] ${signal} received, starting graceful shutdown...`);
    console.log(`[SHUTDOWN] Active requests: ${getActiveRequests()}`);

    if (stopScheduledJobs) {
      try {
        stopScheduledJobs();
      } catch (e) {
        console.warn('[SHUTDOWN] scheduled jobs stop error:', e?.message || e);
      }
    }

    // Step 1: Stop accepting new connections
    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed, no longer accepting connections');
    });

    // Step 2: Close WebSocket connections
    io.close(() => {
      console.log('[SHUTDOWN] WebSocket server closed');
    });

    // Step 3: Wait for active requests to complete (max 30 seconds)
    const waitForRequests = setInterval(() => {
      if (getActiveRequests() === 0) {
        clearInterval(waitForRequests);
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }
        closeDatabase({ shutdownTimeout });
      } else {
        console.log(`[SHUTDOWN] Waiting for ${getActiveRequests()} active requests to complete...`);
      }
    }, 1000);

    // Step 4: Force close after timeout
    shutdownTimeout = setTimeout(() => {
      console.error('[SHUTDOWN] Timeout reached (30s), forcing shutdown');
      clearInterval(waitForRequests);
      closeDatabase({ shutdownTimeout });
    }, 30000);
  }

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  return { gracefulShutdown };
}

