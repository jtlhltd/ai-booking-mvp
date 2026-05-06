import { el, mount } from '../../shared/dom.js';
import '../client-dashboard/styles.css';

function main() {
  const root = document.getElementById('app');
  mount(
    root,
    el('div', { className: 'container' }, [
      el('div', { className: 'card' }, [
        el('div', { className: 'h1', text: 'UK Business Search (Vite page scaffold)' }),
        el('div', {
          className: 'muted',
          text:
            'This page is scaffolded to enable safe splitting. The legacy static page remains available.'
        }),
        el('div', {}, [el('a', { href: '/uk-business-search.html', text: 'Open legacy UK business search' })])
      ])
    ])
  );
}

main();

