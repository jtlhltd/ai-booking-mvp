import express from 'express';

export function createSmsTemplatesRouter(deps) {
  const { authenticateApiKey } = deps || {};
  const router = express.Router();

  router.get('/sms/templates', authenticateApiKey, async (req, res) => {
    try {
      const { listTemplates } = await import('../lib/sms-template-library.js');
      const templates = listTemplates();

      res.json({
        ok: true,
        templates,
        count: templates.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SMS TEMPLATES ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/sms/templates/render', authenticateApiKey, async (req, res) => {
    try {
      const { templateKey, variables } = req.body;

      if (!templateKey) {
        return res.status(400).json({ ok: false, error: 'templateKey is required' });
      }

      const { renderSMSTemplate, validateTemplateVariables } = await import(
        '../lib/sms-template-library.js'
      );

      const validation = validateTemplateVariables(templateKey, variables || {});
      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid template variables',
          missing: validation.missing,
          required: validation.required
        });
      }

      const message = renderSMSTemplate(templateKey, variables);

      res.json({
        ok: true,
        templateKey,
        message,
        variables,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SMS TEMPLATE RENDER ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

