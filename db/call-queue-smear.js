/** Break exact .000s timestamps so many rows never share the same instant (ops top-of-hour + dial spread). */
export function smearCallQueueScheduledFor(scheduledFor, clientKey, leadPhone, queueRowId = null) {
  const t = scheduledFor instanceof Date ? new Date(scheduledFor.getTime()) : new Date(scheduledFor);
  if (Number.isNaN(t.getTime())) return t;
  const ms = t.getTime();
  if (ms % 1000 !== 0) return t;
  let h = 0x811c9dc5;
  const s = `${clientKey}\0${leadPhone ?? ''}\0${queueRowId != null ? String(queueRowId) : ''}\0${ms}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const extra = 1 + ((h >>> 0) % 998);
  return new Date(ms + extra);
}
