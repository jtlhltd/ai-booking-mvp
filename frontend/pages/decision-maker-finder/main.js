import { el, mount } from '../../shared/dom.js';
import '../client-dashboard/styles.css';

function main() {
  const root = document.getElementById('app');
  mount(
    root,
    el('div', { className: 'container' }, [
      el('div', { className: 'card' }, [
        el('div', { className: 'h1', text: 'Decision Maker Finder (Vite scaffold)' }),
        el('div', {
          className: 'muted',
          text: 'This is a scaffold so we can safely split the huge legacy HTML into modules.'
        }),
        el('div', {}, [el('a', { href: '/decision-maker-finder.html', text: 'Open legacy decision maker finder' })])
      ])
    ])
  );
}

main();

