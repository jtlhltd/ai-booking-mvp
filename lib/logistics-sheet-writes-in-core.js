/**
 * Feature flag: when false, core skips Google Sheets logistics writes and sheet_patch retries.
 * Default on (1) for rollback safety until Tom app consumes call.completed webhooks.
 */
export function isLogisticsSheetWritesInCoreEnabled(_clientKey = null) {
  const raw = process.env.LOGISTICS_SHEET_WRITES_IN_CORE;
  if (raw === '0' || raw === 'false' || raw === 'FALSE') return false;
  return true;
}
