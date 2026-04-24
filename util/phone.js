export function normalizePhone(p) {
  if (!p) return p;
  let s = String(p).replace(/[^\d+]/g, '');
  if (!s.startsWith('+')) {
    // naive UK default; refine with libphonenumber later if needed
    // If caller already included the UK country code (44...), don't double-prefix.
    if (s.startsWith('44')) s = '+' + s;
    else s = '+44' + s.replace(/^0+/, '');
  }
  return s;
}
