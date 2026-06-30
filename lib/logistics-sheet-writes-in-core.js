/**
 * Feature flag: when false, core skips Google Sheets logistics writes and sheet_patch retries.
 * Default off — consumer apps (e.g. D2D Xpress) own logistics CRM; set LOGISTICS_SHEET_WRITES_IN_CORE=1 only for rollback.
 */
export function isLogisticsSheetWritesInCoreEnabled(_clientKey = null) {
  const raw = process.env.LOGISTICS_SHEET_WRITES_IN_CORE;
  if (raw === '1' || raw === 'true' || raw === 'TRUE') return true;
  return false;
}
