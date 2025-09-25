// jobs.js (ESM) — minimal follow-up job that triggers an outbound call via Vapi
import * as store from './store.js';
import { startOutboundCall } from './vapi.js';

function backoffMs(attempt) {
  const map = [0, 15*60*1000, 4*60*60*1000, 20*60*60*1000];
  return map[Math.min(attempt, map.length - 1)];
}

export const jobs = {
  async queueFollowUp({ tenantId, leadId }) {
    const lead = await store.leads.getById(leadId);
    if (!lead) return;

    if (await store.optouts.exists(tenantId, lead.phone)) {
      await store.contactAttempts.log({
        tenant_id: tenantId, lead_id: leadId,
        channel: 'call', direction: 'outbound',
        status: 'blocked_by_optout', detail: 'STOP on number'
      });
      return;
    }

    const attempts = (lead.attempts || 0);
    await store.leads.updateOnBooked(leadId, { status: 'calling', attempts });

    const tenant = await store.tenants.findByKey(lead.tenant_id) || { id: tenantId, key: lead.tenant_id };

    try {
      await startOutboundCall({ tenant, lead });
    } catch (err) {
      await store.contactAttempts.log({
        tenant_id: tenantId, lead_id: leadId,
        channel: 'call', direction: 'outbound',
        status: 'failed', detail: String(err?.message || err)
      });

      const nextAttempts = attempts + 1;
      await store.leads.updateOnBooked(leadId, { attempts: nextAttempts, status: 'failed' });

      if (nextAttempts < 3) {
        const wait = backoffMs(nextAttempts);
        setTimeout(() => this.queueFollowUp({ tenantId, leadId }).catch(()=>{}), wait);
      }
    }
  }
};
