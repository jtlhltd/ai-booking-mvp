// slots.js — pick service-specific duration with safe fallbacks
const gcal = require('../gcal');

exports.getTop3 = async ({ tenant, service }) => {
  const svc = (tenant.serviceMap && tenant.serviceMap[service]) || {};
  const duration = Number(svc.durationMin || tenant.booking?.defaultDurationMin || 30);
  const slots = await gcal.findSlots({
    calendarId: tenant.calendarId,
    durationMin: duration,
    timezone: tenant.timezone || process.env.DEFAULT_TZ || 'Europe/London'
  });
  return slots.slice(0, 3);
};
