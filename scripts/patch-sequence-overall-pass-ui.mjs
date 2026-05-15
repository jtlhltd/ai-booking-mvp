import fs from 'node:fs';

const p = 'public/client-dashboard.html';
let s = fs.readFileSync(p, 'utf8');

function replaceOnce(needle, insert, label) {
  if (!s.includes(needle)) throw new Error(`missing anchor: ${label}`);
  s = s.replace(needle, insert);
}

if (!s.includes('outboundSequenceListModeFilters')) {
  replaceOnce(
    `                        <button type="button" class="follow-up-status-chip" data-dashboard-cohort-filter="abandoned">Abandoned·system</button>
                    </div>

                    <div class="outbound-seq-toolbar">`,
    `                        <button type="button" class="follow-up-status-chip" data-dashboard-cohort-filter="abandoned">Abandoned·system</button>
                    </div>
                    <div class="follow-up-status-filters" id="outboundSequenceListModeFilters" role="group" aria-label="Sequence list source" style="margin-top:8px;">
                        <button type="button" class="follow-up-status-chip follow-up-status-chip--active" data-seq-list-mode="sequence_state">In sequence</button>
                        <button type="button" class="follow-up-status-chip" data-seq-list-mode="enrollable">Not enrolled</button>
                    </div>

                    <div class="outbound-seq-toolbar">`,
    'list mode chips'
  );
}

if (!s.includes('outboundSequenceTenantBanner')) {
  replaceOnce(
    `                <div id="outboundSequenceTabRuntimePanel" class="outbound-seq-runtime">
                    <div id="outboundSequenceSummary" class="outreach-strip-facts"`,
    `                <div id="outboundSequenceTabRuntimePanel" class="outbound-seq-runtime">
                    <div id="outboundSequenceTenantBanner" class="tom-ab-test-meta" hidden style="margin:0 0 10px 0;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);"></div>
                    <div id="outboundSequenceSummary" class="outreach-strip-facts"`,
    'tenant banner'
  );
}

replaceOnce(
  `                                <button type="button" class="export-btn secondary" data-seq-bulk-unenroll title="Remove selected leads from multi-call">Unenroll selected</button>
                            </div>
                            <div id="outboundSequenceRecentList"`,
  `                                <button type="button" class="export-btn secondary" data-seq-bulk-unenroll title="Remove selected leads from multi-call">Unenroll selected</button>
                                <button type="button" class="export-btn secondary" data-seq-bulk-stop title="Stop active sequences for selected leads">Stop selected</button>
                            </div>
                            <label class="tom-ab-test-meta" style="display:flex;align-items:center;gap:6px;margin:6px 0 0 0;">
                                <input type="checkbox" id="outboundSequenceQueueOnEnroll" />
                                Queue first dial when enrolling
                            </label>
                            <div id="outboundSequenceRecentList"`,
  'bulk stop + queue checkbox'
);

replaceOnce(
  "        let dashboardCohortFilter = 'all'; // all | classic | sequence | stopped | abandoned",
  `        let dashboardCohortFilter = 'all'; // all | classic | sequence | stopped | abandoned
        let dashboardSequenceListMode = 'sequence_state'; // sequence_state | enrollable`,
  'list mode var'
);

const helperBlock = `
        function outboundSequenceLeadsFetchUrl(clientKey) {
            const base = BASE_URL + '/api/outbound-sequence/' + encodeURIComponent(clientKey);
            if (dashboardSequenceListMode === 'enrollable') {
                return base + '/enrollable-leads?limit=120&offset=0';
            }
            return base + '/leads?limit=120&offset=0&filter=' + encodeURIComponent(dashboardCohortFilter || 'all');
        }

        function outboundSequenceQueueOnEnrollEnabled() {
            const cb = document.getElementById('outboundSequenceQueueOnEnroll');
            return !!(cb && cb.checked);
        }

        function renderOutboundSequenceTenantBanner(sequence) {
            const host = document.getElementById('outboundSequenceTenantBanner');
            if (!host) return;
            const seq = sequence && typeof sequence === 'object' ? sequence : {};
            const parts = [];
            if (seq.killSwitchActive === true) {
                parts.push('Multi-call is globally disabled (OUTBOUND_SEQUENCE_DISABLED). Enrollment and new sequence dials are blocked.');
            } else if (seq.enabled !== true) {
                parts.push('Tenant multi-call sequence is not enabled. Enroll actions will fail until outbound sequence config is turned on.');
            } else if (seq.configValid !== true) {
                parts.push('Sequence config is invalid: ' + (Array.isArray(seq.configErrors) ? seq.configErrors.join(' · ') : 'check Config tab'));
            }
            if (!parts.length) {
                host.hidden = true;
                host.textContent = '';
                return;
            }
            host.hidden = false;
            host.textContent = parts.join(' ');
        }

        function outboundSequenceStuckBadgeHtml(stuckHint) {
            const h = String(stuckHint || '').trim();
            if (h === 'stale_active') return outboundSequenceBadgeHtml('Stale active', 'warning');
            if (h === 'no_next_scheduled') return outboundSequenceBadgeHtml('No next queued', 'warning');
            return '';
        }

        function outboundSequencePendingQueueBadgeHtml(pendingQueue, tz) {
            if (!pendingQueue || !(pendingQueue.pendingCount > 0)) return '';
            const when = pendingQueue.scheduledFor
                ? formatRelativeWithAbsolute(pendingQueue.scheduledFor, tz)
                : 'scheduled';
            return outboundSequenceBadgeHtml('Next stage queued · ' + when, 'info');
        }

        async function applyOutboundSequenceStopBulk(leadPhones) {
            const phones = [...new Set((Array.isArray(leadPhones) ? leadPhones : []).map((p) => String(p || '').trim()).filter(Boolean))];
            if (!phones.length) {
                showToast('No selection', 'Select at least one lead.', 'error', 2500);
                return;
            }
            try {
                const res = await postOperatorClientAction(
                    '/api/clients/' + encodeURIComponent(currentClient) + '/outbound-sequence/stop/bulk',
                    { leadPhones: phones, actor: 'operator' },
                    'Bulk stop sequences'
                );
                const updated = Number(res?.updated) || 0;
                const failed = Number(res?.failed) || 0;
                showToast(
                    'Bulk stop complete',
                    failed > 0 ? formatNumber(updated) + ' stopped, ' + formatNumber(failed) + ' failed.' : formatNumber(updated) + ' sequence(s) stopped.',
                    failed > 0 ? 'warning' : 'success',
                    4500
                );
                await refreshOutboundSequenceWindow(currentClient, { phoneLookup: phones[0] });
                await loadFollowUpQueue(currentClient, { page: followUpQueuePage || 1, silent: false });
            } catch (err) {
                showToast('Bulk stop failed', err?.message || 'Could not stop sequences.', 'error', 4000);
            }
        }

        function updateOutboundSequenceListModeUi() {
            const host = document.getElementById('outboundSequenceListModeFilters');
            if (!host) return;
            host.querySelectorAll('[data-seq-list-mode]').forEach((btn) => {
                const val = btn.getAttribute('data-seq-list-mode') || 'sequence_state';
                btn.classList.toggle('follow-up-status-chip--active', val === dashboardSequenceListMode);
            });
            const cohortHost = document.getElementById('outboundSequenceCohortFilters');
            if (cohortHost) cohortHost.style.opacity = dashboardSequenceListMode === 'enrollable' ? '0.45' : '1';
        }

        function setDashboardSequenceListMode(next, { reload = true } = {}) {
            const val = String(next || '').trim() === 'enrollable' ? 'enrollable' : 'sequence_state';
            dashboardSequenceListMode = val;
            try { localStorage.setItem('dash.dashboardSequenceListMode', val); } catch {}
            updateOutboundSequenceListModeUi();
            if (reload && currentClient) refreshOutboundSequenceWindow(currentClient).catch(() => {});
        }
`;

if (!s.includes('outboundSequenceLeadsFetchUrl')) {
  replaceOnce(
    '        function outboundSequencePhoneKey(phone) {',
    helperBlock + '\n        function outboundSequencePhoneKey(phone) {',
    'helpers'
  );
}

replaceOnce(
  `                const res = await postOperatorClientAction(
                    \`/api/clients/\${encodeURIComponent(currentClient)}/outbound-sequence/enrollment/bulk\`,
                    { leadPhones: phones, enrolled: !!enrolled, actor: 'operator' },
                    label
                );`,
  `                const res = await postOperatorClientAction(
                    \`/api/clients/\${encodeURIComponent(currentClient)}/outbound-sequence/enrollment/bulk\`,
                    { leadPhones: phones, enrolled: !!enrolled, actor: 'operator', queueNow: enrolled && outboundSequenceQueueOnEnrollEnabled() },
                    label
                );`,
  'bulk enroll queueNow'
);

replaceOnce(
  `                            await postOperatorClientAction(
                                \`/api/clients/\${encodeURIComponent(currentClient)}/outbound-sequence/enrollment\`,
                                { leadPhone: phone, enrolled, actor: 'operator' },
                                enrolled ? 'Enroll in multi-call' : 'Remove from multi-call'
                            );`,
  `                            await postOperatorClientAction(
                                \`/api/clients/\${encodeURIComponent(currentClient)}/outbound-sequence/enrollment\`,
                                { leadPhone: phone, enrolled, actor: 'operator', queueNow: enrolled && outboundSequenceQueueOnEnrollEnabled() },
                                enrolled ? 'Enroll in multi-call' : 'Remove from multi-call'
                            );`,
  'single enroll queueNow'
);

replaceOnce(
  `                    fetch(\`\${BASE_URL}/api/outbound-sequence/\${encodeURIComponent(clientKey)}/leads?limit=120&offset=0&filter=\${encodeURIComponent(dashboardCohortFilter || 'all')}\`, { cache: 'no-store' }).then((r) => r.json()),`,
  `                    fetch(outboundSequenceLeadsFetchUrl(clientKey), { cache: 'no-store' }).then((r) => r.json()),`,
  'leads fetch url'
);

replaceOnce(
  `                if (summaryRes?.ok) renderOutboundSequenceConfig(summaryRes.sequence || {}, summaryRes.sequence?.stages || []);`,
  `                if (summaryRes?.ok) {
                    renderOutboundSequenceConfig(summaryRes.sequence || {}, summaryRes.sequence?.stages || []);
                    renderOutboundSequenceTenantBanner(summaryRes.sequence || leadsRes?.sequence || {});
                }`,
  'tenant banner refresh'
);

replaceOnce(
  `                    fact('Next-stage queued', formatNumber(s.nextStageQueued ?? 0), "pending/processing call_queue rows where triggerType='sequence_next'"),
                    fact(oldestLabel, oldestValue, oldestHint),
                ].join('');`,
  `                    fact('Next-stage queued', formatNumber(s.nextStageQueued ?? 0), "pending/processing call_queue rows where triggerType='sequence_next'"),
                    fact(oldestLabel, oldestValue, oldestHint),
                    fact('Multi-call enrolled', formatNumber(s.enrollment?.optedIn ?? 0), (s.enrollment?.capped ? 'sample of recent leads (capped)' : 'recent leads sample')),
                    fact('Not enrolled', formatNumber(s.enrollment?.notOptedIn ?? 0), 'same sample · use Not enrolled list to act'),
                ].join('');`,
  'summary enrollment'
);

replaceOnce(
  `            if (f === 'classic' || f === 'sequence') {
                return \`Showing \${dashboardCohortFilterLabel(f)} cohort. Click a row to inspect captured data and sequence status.\`;
            }
            return 'Click a row to inspect the lead, review captured data, and stop future sequence dials if needed.';`,
  `            if (f === 'classic' || f === 'sequence') {
                return \`Showing \${dashboardCohortFilterLabel(f)} cohort. Click a row to inspect captured data and sequence status.\`;
            }
            if (dashboardSequenceListMode === 'enrollable') {
                return 'Leads not opted into multi-call. Select rows and use Enroll selected, or open a row to enroll one lead.';
            }
            return 'Click a row to inspect the lead, review captured data, and stop future sequence dials if needed.';`,
  'intro enrollable'
);

replaceOnce(
  `                host.innerHTML = \`<div class="empty-state-message" style="padding:8px;">No \${escapeHtml(dashboardCohortFilterLabel(dashboardCohortFilter))} rows in the current window.</div>\`;`,
  `                const emptyMsg = dashboardSequenceListMode === 'enrollable'
                    ? 'No not-enrolled leads in the recent sample. Import leads or switch to In sequence.'
                    : 'No ' + dashboardCohortFilterLabel(dashboardCohortFilter) + ' rows in the current window.';
                host.innerHTML = \`<div class="empty-state-message" style="padding:8px;">\${escapeHtml(emptyMsg)}</div>\`;`,
  'empty state'
);

replaceOnce(
  `                                \${outboundSequenceBadgeHtml(multiCallEnrolled ? 'Multi-call enrolled' : 'Multi-call not enrolled', multiCallEnrolled ? 'success' : 'neutral')}
                            </div>`,
  `                                \${outboundSequenceBadgeHtml(multiCallEnrolled ? 'Multi-call enrolled' : 'Multi-call not enrolled', multiCallEnrolled ? 'success' : 'neutral')}
                                \${outboundSequenceStuckBadgeHtml(r?.stuckHint)}
                                \${outboundSequencePendingQueueBadgeHtml(r?.pendingSequenceQueue, tz)}
                            </div>`,
  'row badges'
);

replaceOnce(
  `                    const enrollBtn = e.target.closest('[data-seq-bulk-enroll]');
                    const unenrollBtn = e.target.closest('[data-seq-bulk-unenroll]');
                    if (enrollBtn || unenrollBtn) {`,
  `                    const stopBtn = e.target.closest('[data-seq-bulk-stop]');
                    if (stopBtn) {
                        const phones = [...outboundSequenceSelectedPhones].map((k) => {
                            const hit = (outboundSequenceRecentRows || []).find(
                                (r) => outboundSequencePhoneKey(r?.leadPhone || '') === k
                            );
                            return hit?.leadPhone || k;
                        });
                        await applyOutboundSequenceStopBulk(phones);
                        return;
                    }
                    const enrollBtn = e.target.closest('[data-seq-bulk-enroll]');
                    const unenrollBtn = e.target.closest('[data-seq-bulk-unenroll]');
                    if (enrollBtn || unenrollBtn) {`,
  'bulk stop click'
);

replaceOnce(
  `                if (['all', 'classic', 'sequence', 'stopped', 'abandoned'].includes(cf)) dashboardCohortFilter = cf;
            } catch {}`,
  `                if (['all', 'classic', 'sequence', 'stopped', 'abandoned'].includes(cf)) dashboardCohortFilter = cf;
                const lm = localStorage.getItem('dash.dashboardSequenceListMode') || '';
                if (['sequence_state', 'enrollable'].includes(lm)) dashboardSequenceListMode = lm;
            } catch {}`,
  'ls list mode'
);

replaceOnce(
  `            if (cohortFilters && !cohortFilters.dataset.bound) {
                cohortFilters.dataset.bound = '1';
                cohortFilters.addEventListener('click', (e) => {
                    const chip = e.target.closest('[data-dashboard-cohort-filter]');
                    if (!chip) return;
                    const val = chip.getAttribute('data-dashboard-cohort-filter') || 'all';
                    setDashboardCohortFilter(val, { reloadFollowUp: true, reloadSequence: true });
                });
            }

            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => refreshOutboundSequenceWindow(currentClient));
            }`,
  `            if (cohortFilters && !cohortFilters.dataset.bound) {
                cohortFilters.dataset.bound = '1';
                cohortFilters.addEventListener('click', (e) => {
                    const chip = e.target.closest('[data-dashboard-cohort-filter]');
                    if (!chip) return;
                    if (dashboardSequenceListMode === 'enrollable') return;
                    const val = chip.getAttribute('data-dashboard-cohort-filter') || 'all';
                    setDashboardCohortFilter(val, { reloadFollowUp: true, reloadSequence: true });
                });
            }
            const listModeFilters = document.getElementById('outboundSequenceListModeFilters');
            if (listModeFilters && !listModeFilters.dataset.bound) {
                listModeFilters.dataset.bound = '1';
                listModeFilters.addEventListener('click', (e) => {
                    const chip = e.target.closest('[data-seq-list-mode]');
                    if (!chip) return;
                    setDashboardSequenceListMode(chip.getAttribute('data-seq-list-mode') || 'sequence_state');
                });
                updateOutboundSequenceListModeUi();
            }

            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => refreshOutboundSequenceWindow(currentClient));
            }`,
  'list mode bind'
);

replaceOnce(
  `                    \${fact('Multi-call enrollment', sequenceOptedIn ? 'Enrolled' : 'Not enrolled')}
                    \${fact('Lead created', lead.createdAt ? formatRelativeWithAbsolute(lead.createdAt, tz) : '—')}`,
  `                    \${fact('Multi-call enrollment', sequenceOptedIn ? 'Enrolled' : 'Not enrolled')}
                    \${(() => {
                        const vv = (payload?.lead?.dialContext || row?.lead?.dialContext || {});
                        const at = vv.sequenceEnrollmentAt || vv.sequenceUnenrolledAt;
                        const by = vv.sequenceEnrollmentBy || vv.sequenceUnenrolledBy;
                        return at ? fact('Enrollment audit', (by || 'operator') + ' · ' + formatRelativeWithAbsolute(at, tz)) : '';
                    })()}
                    \${fact('Lead created', lead.createdAt ? formatRelativeWithAbsolute(lead.createdAt, tz) : '—')}`,
  'detail audit'
);

fs.writeFileSync(p, s);
console.log('patched UI ok');
