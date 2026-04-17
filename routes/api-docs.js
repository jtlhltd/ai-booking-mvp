import express from 'express';

export function createApiDocsRouter() {
  const router = express.Router();

  router.get('/api-docs', async (req, res) => {
    try {
      const { generateApiDocs } = await import('../lib/api-documentation.js');
      const docs = generateApiDocs();

      if (req.query.format === 'json') {
        return res.json(docs);
      }
      if (req.query.format === 'html' || req.accepts('text/html')) {
        res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>API Documentation - AI Booking System</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api-docs?format=json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.presets.standalone
        ]
      });
    };
  </script>
</body>
</html>
      `);
      } else {
        res.json(docs);
      }
    } catch (error) {
      console.error('[API DOCS ERROR]', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

