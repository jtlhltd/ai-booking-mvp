import { initBrowserSentry } from '../../shared/sentry.js';

initBrowserSentry();

// Socket.IO is loaded via CDN in index.html
const socket = window.io();
let pipelineData = null;

async function loadPipeline() {
  try {
    const response = await fetch('/api/admin/pipeline');
    pipelineData = await response.json();
    renderPipeline();

    document.getElementById('totalLeads').textContent = pipelineData.totalLeads;
    document.getElementById('conversionRate').textContent = pipelineData.conversionRate + '%';
  } catch (error) {
    console.error('Error loading pipeline:', error);
    document.getElementById('pipelineBoard').innerHTML = '<div class="loading">Error loading pipeline</div>';
  }
}

function renderPipeline() {
  const board = document.getElementById('pipelineBoard');
  board.innerHTML = '';

  pipelineData.stages.forEach((stage) => {
    const column = document.createElement('div');
    column.className = 'stage-column';
    column.style.borderTopColor = stage.color;
    column.dataset.stageId = stage.id;

    column.innerHTML = `
      <div class="stage-header" style="border-color: ${stage.color}">
        <h3>${stage.name}</h3>
        <span class="stage-count">${stage.count}</span>
      </div>
      <div class="stage-content" data-stage="${stage.id}">
        ${stage.leads.length === 0 ? '<div class="empty-stage">No leads</div>' : ''}
      </div>
    `;

    const content = column.querySelector('.stage-content');
    stage.leads.forEach((lead) => {
      const card = createLeadCard(lead);
      content.appendChild(card);
    });

    makeDroppable(column);
    board.appendChild(column);
  });
}

function createLeadCard(lead) {
  const card = document.createElement('div');
  card.className = `lead-card priority-${lead.priority || 'medium'}`;
  card.draggable = true;
  card.dataset.leadId = lead.id;

  const clientName = lead.client_name || 'Unknown Client';
  const callCount = lead.call_count || 0;

  card.innerHTML = `
    <div class="lead-name">${lead.name || 'Unnamed Lead'}</div>
    <div class="lead-info">📞 ${lead.phone}</div>
    <div class="lead-info">🏢 ${clientName}</div>
    <div class="lead-info">📈 ${callCount} calls</div>
    <div class="lead-score">Score: ${lead.score || 0}</div>
  `;

  makeDraggable(card);
  return card;
}

function makeDraggable(card) {
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.dataset.leadId);
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
}

function makeDroppable(column) {
  const stageContent = column.querySelector('.stage-content');

  stageContent.addEventListener('dragover', (e) => {
    e.preventDefault();
    stageContent.classList.add('drag-over');
  });

  stageContent.addEventListener('dragleave', () => {
    stageContent.classList.remove('drag-over');
  });

  stageContent.addEventListener('drop', async (e) => {
    e.preventDefault();
    stageContent.classList.remove('drag-over');

    const leadId = e.dataTransfer.getData('text/plain');
    const targetStage = column.dataset.stageId;

    await updateLeadStage(leadId, targetStage);
  });
}

async function updateLeadStage(leadId, targetStage) {
  try {
    const response = await fetch(`/api/admin/pipeline/lead/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: targetStage }),
    });

    if (response.ok) await loadPipeline();
  } catch (error) {
    console.error('Error updating lead stage:', error);
  }
}

socket.on('pipeline-update', (data) => {
  console.log('Pipeline update:', data);
  loadPipeline();
});

loadPipeline();
setInterval(loadPipeline, 30000);

