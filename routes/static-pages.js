// Named HTML routes (after express.static — only paths without a matching file hit these).
import { Router } from 'express';
import path from 'path';

const router = Router();
const cwd = process.cwd();

function sendPublic(res, filename) {
  res.sendFile(path.join(cwd, 'public', filename));
}

router.get('/', (_req, res) => {
  sendPublic(res, 'index.html');
});

router.get('/tenant-dashboard', (_req, res) => {
  sendPublic(res, 'tenant-dashboard.html');
});

router.get('/client-dashboard', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  sendPublic(res, 'client-dashboard.html');
});

router.get('/client-setup', (_req, res) => {
  sendPublic(res, 'client-setup.html');
});

router.get('/client-template', (_req, res) => {
  sendPublic(res, 'client-dashboard-template.html');
});

router.get('/setup-guide', (_req, res) => {
  sendPublic(res, 'client-setup-guide.html');
});

router.get('/onboarding', (_req, res) => {
  sendPublic(res, 'onboarding-dashboard.html');
});

router.get('/onboarding-templates', (_req, res) => {
  sendPublic(res, 'onboarding-templates.html');
});

router.get('/onboarding-wizard', (_req, res) => {
  sendPublic(res, 'client-onboarding-wizard.html');
});

router.get('/uk-business-search', (_req, res) => {
  sendPublic(res, 'uk-business-search.html');
});

router.get('/decision-maker-finder', (_req, res) => {
  sendPublic(res, 'decision-maker-finder.html');
});

router.get('/cold-call-dashboard', (_req, res) => {
  sendPublic(res, 'cold-call-dashboard.html');
});

router.get('/vapi-test-dashboard', (_req, res) => {
  sendPublic(res, 'vapi-test-dashboard.html');
});

router.get('/admin-hub.html', (_req, res) => {
  sendPublic(res, 'admin-hub-enterprise.html');
});

router.get('/admin-hub', (_req, res) => {
  sendPublic(res, 'admin-hub-enterprise.html');
});

router.get('/pipeline', (_req, res) => {
  sendPublic(res, 'pipeline-kanban.html');
});

export default router;
