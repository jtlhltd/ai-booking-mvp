// routes/api/v1/index.js
// API v1 routes

import express from 'express';

const router = express.Router();

// API v1 metadata
router.get('/', (req, res) => {
  res.json({
    version: '1.0.0',
    status: 'active',
    deprecationDate: null,
    documentation: '/api-docs',
    endpoints: {
      health: '/api/v1/health',
      stats: '/api/v1/stats',
      clients: '/api/v1/clients',
      leads: '/api/v1/leads',
      appointments: '/api/v1/appointments',
      calls: '/api/v1/calls',
      messages: '/api/v1/messages'
    }
  });
});

export default router;

