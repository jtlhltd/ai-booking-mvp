import { apiGetJson } from '../../shared/api.js';
import { el, mount } from '../../shared/dom.js';
import '../client-dashboard/styles.css';
import './styles.css';

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  const state = {
    q: '',
    loading: false,
    error: null,
    results: [],
  };

  const qInput = el('input', {
    className: 'ukSearchInput',
    placeholder: 'Search (name, town, SIC, etc.)',
    value: '',
    oninput: (e) => {
      state.q = e.target.value;
    },
  });

  const statusEl = el('div', { className: 'ukSearchStatus' }, '');
  const resultsEl = el('div', { className: 'ukSearchResults' }, '');

  async function runSearch() {
    const q = String(state.q || '').trim();
    if (!q) return;

    state.loading = true;
    state.error = null;
    statusEl.textContent = 'Searching…';
    try {
      const url = `/api/uk-business-search?q=${encodeURIComponent(q)}`;
      const json = await apiGetJson(url);
      const rows = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
      state.results = rows;
      statusEl.textContent = `Found ${rows.length}`;
    } catch (e) {
      state.error = e?.message || String(e);
      state.results = [];
      statusEl.textContent = `Error: ${state.error}`;
    } finally {
      state.loading = false;
    }

    renderResults();
  }

  function renderResults() {
    if (!state.results.length) {
      mount(
        resultsEl,
        el('div', { className: 'ukSearchEmpty' }, [
          el('div', { className: 'ukSearchEmptyTitle', text: 'No results yet.' }),
          el('div', { className: 'ukSearchEmptyMuted', text: 'Try a company name, town, or SIC keyword.' }),
          el('div', {}, [
            el('a', {
              className: 'ukSearchLegacyLink',
              href: '/uk-business-search.html',
              target: '_blank',
              rel: 'noreferrer',
              text: 'Open legacy UK business search',
            }),
          ]),
        ])
      );
      return;
    }

    const table = el('table', { className: 'ukSearchTable' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Name' }),
          el('th', { text: 'Phone' }),
          el('th', { text: 'Website' }),
          el('th', { text: 'Address' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        state.results.map((r) => {
          const name = r?.name || r?.businessName || '';
          const phone = r?.phone || r?.telephone || '';
          const website = r?.website || r?.url || '';
          const address = r?.address || r?.fullAddress || '';
          return el('tr', {}, [
            el('td', { text: String(name) }),
            el('td', { text: String(phone) }),
            el('td', {}, [
              website
                ? el('a', { href: String(website), target: '_blank', rel: 'noreferrer', text: String(website) })
                : '',
            ]),
            el('td', { text: String(address) }),
          ]);
        })
      ),
    ]);

    mount(resultsEl, table);
  }

  const header = el('div', { className: 'ukSearchHeader' }, [
    el('div', { className: 'ukSearchTitle', text: 'UK Business Search' }),
    el('div', { className: 'ukSearchControls' }, [
      qInput,
      el('button', { className: 'ukSearchBtn', onclick: runSearch, text: 'Search' }),
      statusEl,
    ]),
  ]);

  mount(root, el('div', { className: 'ukSearchPage' }, [header, resultsEl]));
  renderResults();
}

main();

