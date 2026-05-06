function normalizeServiceEntry(id, raw) {
  if (!raw || typeof raw !== 'object') return { id };
  const durationMin = raw.durationMin ?? raw.duration_minutes ?? raw.duration ?? raw.minutes ?? raw.min;
  const bufferMin = raw.bufferMin ?? raw.buffer_minutes ?? raw.buffer ?? raw.bufferMinutes;
  return {
    id,
    name: raw.name ?? raw.label ?? raw.title ?? id,
    durationMin: durationMin != null ? Number(durationMin) : undefined,
    bufferMin: bufferMin != null ? Number(bufferMin) : undefined,
    slotStepMin: raw.slotStepMin != null ? Number(raw.slotStepMin) : undefined,
  };
}

/**
 * Normalize a tenant's service catalog to an array of services.
 *
 * Supports:
 * - array of services: [{ id, durationMin, ... }]
 * - map/object: { "<id>": { durationMin, ... } }
 */
export function servicesFor(client) {
  const raw =
    client?.booking?.services ??
    client?.services ??
    client?.serviceMap ??
    client?.calendar?.services ??
    null;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);

  if (typeof raw === 'object') {
    return Object.entries(raw).map(([id, v]) => normalizeServiceEntry(id, v));
  }

  return [];
}

