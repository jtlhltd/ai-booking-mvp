import { el, mount } from '../../shared/dom.js';
import '../client-dashboard/styles.css';

function main() {
  const root = document.getElementById('app');
  mount(
    root,
    el('div', { className: 'container' }, [
      el('div', { className: 'card' }, [
        el('div', { className: 'h1', text: 'Admin Hub (Vite page scaffold)' }),
        el('div', {
          className: 'muted',
          text:
            'This is a scaffold page so we can split the huge legacy HTML safely. For now, use the legacy admin hub.'
        }),
        el('div', {}, [
          el('a', { href: '/admin-hub-enterprise.html', text: 'Open legacy admin hub' })
        ])
      ])
    ])
  );
}

main();

