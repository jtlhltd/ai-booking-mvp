/**
 * Logistics sheet "Business Name" = company we dialed (callee), never the tenant `client_key` slug.
 */
export function pickCalleeBusinessNameForSheet({
  tenantKey,
  metadata = {},
  customerName,
  structuredFields = {}
}) {
  const tk = String(tenantKey || '').trim().toLowerCase();
  const isBad = (s) => {
    const v = String(s ?? '').trim();
    if (!v) return true;
    if (tk && v.toLowerCase() === tk) return true;
    return false;
  };
  const candidates = [
    metadata?.leadName,
    metadata?.businessName,
    structuredFields?.businessName,
    structuredFields?.companyName,
    customerName,
  ];
  for (const c of candidates) {
    if (isBad(c)) continue;
    return String(c).trim();
  }
  return '';
}
