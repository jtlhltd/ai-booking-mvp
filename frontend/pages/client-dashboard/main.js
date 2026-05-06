import './styles.css';
import { el, mount } from '../../shared/dom.js';
import { renderLeadsCard } from './widgets/leads.js';
import { renderCallsCard } from './widgets/calls.js';

function getClientKeyFromUrl() {
  const u = new URL(window.location.href);
  return u.searchParams.get('clientKey') || '';
}

async function main() {
  const root = document.getElementById('app');
  const clientKey = getClientKeyFromUrl();

  const header = el('div', { className: 'card' }, [
    el('div', { className: 'h1', text: 'Client Dashboard' }),
    el('div', {
      className: 'muted',
      text: clientKey ? `clientKey: ${clientKey}` : 'Missing clientKey (add ?clientKey=...)'
    })
  ]);

  const container = el('div', { className: 'container' }, [header]);
  mount(root, container);

  if (!clientKey) return;

  const row = el('div', { className: 'row' });
  container.append(row);
  row.append(await renderLeadsCard({ clientKey }));
  row.append(await renderCallsCard({ clientKey }));
}

main().catch((e) => {
  const root = document.getElementById('app');
  mount(
    root,
    el('div', { className: 'container' }, [
      el('div', { className: 'card error', text: `Dashboard failed to load: ${e.message}` })
    ])
  );
});

