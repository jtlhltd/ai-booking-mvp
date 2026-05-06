import { apiGetJson } from '../../../shared/api.js';
import { el } from '../../../shared/dom.js';

export async function renderLeadsCard({ clientKey }) {
  const card = el('div', { className: 'card' }, [
    el('div', { className: 'h1', text: 'Leads' }),
    el('div', { className: 'muted', text: 'Latest leads (read-only view)' })
  ]);

  try {
    // Existing API shape varies across tenants; we try the most common endpoint first.
    const data = await apiGetJson(`/api/leads?clientKey=${encodeURIComponent(clientKey)}`);
    const leads = data?.leads || data?.rows || [];

    const table = el('table');
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Name' }),
          el('th', { text: 'Phone' }),
          el('th', { text: 'Status' }),
          el('th', { text: 'Source' })
        ])
      ])
    );
    table.append(
      el(
        'tbody',
        {},
        leads.slice(0, 20).map((l) =>
          el('tr', {}, [
            el('td', { text: l?.name || '' }),
            el('td', { text: l?.phone || '' }),
            el('td', { text: l?.status || '' }),
            el('td', { text: l?.source || '' })
          ])
        )
      )
    );
    card.append(table);
  } catch (e) {
    card.append(el('div', { className: 'error', text: `Failed to load leads: ${e.message}` }));
  }

  return card;
}

