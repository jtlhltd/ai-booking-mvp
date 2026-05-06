import { apiGetJson } from '../../../shared/api.js';
import { el } from '../../../shared/dom.js';

export async function renderCallsCard({ clientKey }) {
  const card = el('div', { className: 'card' }, [
    el('div', { className: 'h1', text: 'Calls' }),
    el('div', { className: 'muted', text: 'Recent calls (read-only view)' })
  ]);

  try {
    const data = await apiGetJson(`/api/calls?clientKey=${encodeURIComponent(clientKey)}`);
    const calls = data?.calls || data?.rows || [];

    const table = el('table');
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Lead' }),
          el('th', { text: 'Phone' }),
          el('th', { text: 'Outcome' }),
          el('th', { text: 'When' })
        ])
      ])
    );
    table.append(
      el(
        'tbody',
        {},
        calls.slice(0, 20).map((c) =>
          el('tr', {}, [
            el('td', { text: c?.lead_name || c?.leadName || c?.name || '' }),
            el('td', { text: c?.lead_phone || c?.leadPhone || c?.phone || '' }),
            el('td', { text: c?.outcome || c?.endedReason || c?.status || '' }),
            el('td', { text: c?.created_at || c?.createdAt || '' })
          ])
        )
      )
    );
    card.append(table);
  } catch (e) {
    card.append(el('div', { className: 'error', text: `Failed to load calls: ${e.message}` }));
  }

  return card;
}

