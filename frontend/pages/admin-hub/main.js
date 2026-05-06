import '../client-dashboard/styles.css';
import './styles.css';

function main() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'adminHubShell';

  const top = document.createElement('div');
  top.className = 'adminHubTopbar';
  top.innerHTML = `
    <div class="adminHubTitle">Admin Hub</div>
    <div class="adminHubActions">
      <a class="adminHubLink" href="/admin-hub-enterprise.html" target="_blank" rel="noreferrer">Open in new tab</a>
    </div>
  `;

  const frame = document.createElement('iframe');
  frame.className = 'adminHubFrame';
  frame.src = '/admin-hub-enterprise.html';
  frame.title = 'Admin Hub';

  shell.appendChild(top);
  shell.appendChild(frame);
  root.appendChild(shell);
}

main();

