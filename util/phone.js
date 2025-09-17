// util/phone.js
function normalizePhone(p) {
  if (!p) return p;
  let s = String(p).replace(/[^\d+]/g, '');
  if (!s.startsWith('+')) {
    // naive UK default; refine with libphonenumber later if needed
    s = '+44' + s.replace(/^0+/, '');
  }
  return s;
}
module.exports = { normalizePhone };
