/**
 * Canonical phone match key for lead de-duplication, import upsert, and dashboard/call joins.
 * Last 10 digits when length ≥ 10; otherwise full digit string (matches historical SQL in metrics).
 */

export function phoneMatchKey(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length >= 10) return d.slice(-10);
  return d;
}

/**
 * PostgreSQL expression for a qualified column (e.g. "l.phone", "c.lead_phone").
 */
export function pgLeadPhoneKeyExpr(qualifiedPhoneCol) {
  return `(CASE WHEN LENGTH(regexp_replace(COALESCE(${qualifiedPhoneCol}, ''), '[^0-9]', '', 'g')) >= 10 THEN RIGHT(regexp_replace(COALESCE(${qualifiedPhoneCol}, ''), '[^0-9]', '', 'g'), 10) ELSE NULLIF(regexp_replace(COALESCE(${qualifiedPhoneCol}, ''), '[^0-9]', '', 'g'), '') END)`;
}
