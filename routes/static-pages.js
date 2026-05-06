// Named HTML routes (after express.static — only paths without a matching file hit these).
import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();
const cwd = process.cwd();

function sendPublic(res, filename) {
  res.sendFile(path.join(cwd, 'public', filename));
}

function sendBuiltIfPresent(res, builtRelPath, fallbackPublicFilename) {
  const absBuilt = path.join(cwd, 'public', 'build', builtRelPath);
  if (fs.existsSync(absBuilt)) return res.sendFile(absBuilt);
  return sendPublic(res, fallbackPublicFilename);
}

router.get('/', (_req, res) => {
  sendPublic(res, 'index.html');
});

router.get('/tenant-dashboard', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'tenant-dashboard', 'index.html'), 'tenant-dashboard.html');
});

router.get('/client-dashboard', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  sendBuiltIfPresent(res, path.join('pages', 'client-dashboard', 'index.html'), 'client-dashboard.html');
});

router.get('/client-setup', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'client-setup', 'index.html'), 'client-setup.html');
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
  sendBuiltIfPresent(res, path.join('pages', 'uk-business-search', 'index.html'), 'uk-business-search.html');
});

router.get('/decision-maker-finder', (_req, res) => {
  sendBuiltIfPresent(
    res,
    path.join('pages', 'decision-maker-finder', 'index.html'),
    'decision-maker-finder.html'
  );
});

router.get('/cold-call-dashboard', (_req, res) => {
  sendPublic(res, 'cold-call-dashboard.html');
});

router.get('/vapi-test-dashboard', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'vapi-test-dashboard', 'index.html'), 'vapi-test-dashboard.html');
});

router.get('/admin-hub.html', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'admin-hub', 'index.html'), 'admin-hub-enterprise.html');
});

router.get('/admin-hub', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'admin-hub', 'index.html'), 'admin-hub-enterprise.html');
});

router.get('/pipeline', (_req, res) => {
  sendBuiltIfPresent(res, path.join('pages', 'pipeline', 'index.html'), 'pipeline-kanban.html');
});

export default router;
