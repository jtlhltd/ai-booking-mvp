/**
 * Shared graceful DB pool shutdown (used from server.js shutdown wiring).
 */
export async function closeDatabasePool(pool) {
  if (pool) {
    console.log('[SHUTDOWN] Closing database pool...');
    await pool.end();
    console.log('[SHUTDOWN] Database pool closed successfully');
  }

  console.log('[SHUTDOWN] Graceful shutdown complete');
  process.exit(0);
}
