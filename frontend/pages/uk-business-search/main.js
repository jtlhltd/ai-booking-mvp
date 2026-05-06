import '../client-dashboard/styles.css';
import './styles.css';

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'embeddedLegacyShell';

  const top = document.createElement('div');
  top.className = 'embeddedLegacyTopbar';
  top.innerHTML = `
    <div class="embeddedLegacyTitle">UK Business Search</div>
    <div class="embeddedLegacyActions">
      <a class="embeddedLegacyLink" href="/uk-business-search.html" target="_blank" rel="noreferrer">Open in new tab</a>
    </div>
  `;

  const frame = document.createElement('iframe');
  frame.className = 'embeddedLegacyFrame';
  frame.src = '/uk-business-search.html';
  frame.title = 'UK Business Search';

  shell.appendChild(top);
  shell.appendChild(frame);
  root.appendChild(shell);
}

main();

