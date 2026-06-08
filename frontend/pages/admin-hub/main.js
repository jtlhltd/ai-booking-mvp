import { initBrowserSentry } from '../../shared/sentry.js';
import { apiGetJson } from '../../shared/api.js';

initBrowserSentry();
import { el, mount } from '../../shared/dom.js';
import '../client-dashboard/styles.css';
import './styles.css';

function getAdminApiKey() {
  try {
    return localStorage.getItem('ADMIN_API_KEY') || '';
  } catch {
    return '';
  }
}

function setAdminApiKey(v) {
  try {
    localStorage.setItem('ADMIN_API_KEY', v || '');
  } catch {
    // ignore
  }
}

async function apiAdmin(path, { apiKey }) {
  const headers = apiKey ? { 'X-API-Key': apiKey } : undefined;
  return await apiGetJson(path, { headers });
}

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  const state = {
    apiKey: getAdminApiKey(),
    loading: false,
    error: null,
    overview: null,
    needingAttention: null,
  };

  const apiKeyInput = el('input', {
    className: 'adminHubInput',
    placeholder: 'Admin API key (stored locally)',
    value: state.apiKey,
    oninput: (e) => {
      state.apiKey = e.target.value;
      setAdminApiKey(state.apiKey);
    },
  });

  const statusEl = el('div', { className: 'adminHubStatus' }, '');
  const content = el('div', { className: 'adminHubContent' }, '');

  async function refresh() {
    state.loading = true;
    state.error = null;
    statusEl.textContent = 'Loading…';

    try {
      const [overview, needingAttention] = await Promise.all([
        apiAdmin('/api/admin/clients/overview', { apiKey: state.apiKey }),
        apiAdmin('/api/admin/clients/needing-attention', { apiKey: state.apiKey }),
      ]);
      state.overview = overview;
      state.needingAttention = needingAttention;
      statusEl.textContent = 'OK';
    } catch (e) {
      state.error = e?.message || String(e);
      statusEl.textContent = `Error: ${state.error}`;
      state.overview = null;
      state.needingAttention = null;
    } finally {
      state.loading = false;
    }

    renderContent();
  }

  function renderJsonCard(title, value) {
    return el('div', { className: 'adminHubCard' }, [
      el('div', { className: 'adminHubCardTitle', text: title }),
      el('pre', { className: 'adminHubPre', text: JSON.stringify(value, null, 2) }),
    ]);
  }

  function renderContent() {
    const kids = [];
    if (state.overview) kids.push(renderJsonCard('Clients overview', state.overview));
    if (state.needingAttention) kids.push(renderJsonCard('Clients needing attention', state.needingAttention));
    if (!kids.length) {
      kids.push(
        el('div', { className: 'adminHubEmpty' }, [
          el('div', { className: 'adminHubEmptyTitle', text: 'Enter an admin key to load data.' }),
          el('div', {
            className: 'adminHubEmptyMuted',
            text:
              'This page replaces the iframe shell. It calls existing /api/admin endpoints and renders JSON while we continue migrating widgets.',
          }),
          el('div', {}, [
            el('a', { className: 'adminHubLink', href: '/admin-hub-enterprise.html', target: '_blank', rel: 'noreferrer', text: 'Open legacy admin hub' }),
          ]),
        ])
      );
    }

    mount(content, el('div', { className: 'adminHubGrid' }, kids));
  }

  const topbar = el('div', { className: 'adminHubTopbar2' }, [
    el('div', { className: 'adminHubTitle2', text: 'Admin Hub' }),
    el('div', { className: 'adminHubTopbarRight' }, [
      apiKeyInput,
      el('button', { className: 'adminHubBtn', onclick: refresh, text: 'Refresh' }),
      statusEl,
    ]),
  ]);

  mount(root, el('div', { className: 'adminHubPage' }, [topbar, content]));
  renderContent();
}

main();

