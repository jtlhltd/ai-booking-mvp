/**
 * POST /api/leads/score and POST /api/leads/prioritize (extracted from server.js).
 */
export async function handleLeadsScore(req, res, deps) {
  const { LeadScoringEngine } = deps || {};
  try {
    const { lead, clientKey } = req.body;

    if (!lead || !clientKey) {
      return res.status(400).json({ ok: false, error: 'lead and clientKey are required' });
    }

    const scoringEngine = new LeadScoringEngine();
    const score = await scoringEngine.scoreLeadWithHistory(lead, clientKey);

    res.json({
      ok: true,
      lead: {
        ...lead,
        score,
      },
      score,
      scoreCategory: score >= 80 ? 'high' : score >= 60 ? 'medium' : score >= 40 ? 'low' : 'very_low',
    });
  } catch (error) {
    console.error('[LEAD SCORING ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function handleLeadsPrioritize(req, res, deps) {
  const { LeadScoringEngine } = deps || {};
  try {
    const { leads, clientKey } = req.body;

    if (!leads || !Array.isArray(leads) || !clientKey) {
      return res.status(400).json({ ok: false, error: 'leads (array) and clientKey are required' });
    }

    const scoringEngine = new LeadScoringEngine();
    const prioritized = await scoringEngine.prioritizeLeadsWithHistory(leads, clientKey);

    res.json({
      ok: true,
      leads: prioritized,
      total: prioritized.length,
      highPriority: prioritized.filter((l) => l.score >= 80).length,
      mediumPriority: prioritized.filter((l) => l.score >= 60 && l.score < 80).length,
      lowPriority: prioritized.filter((l) => l.score < 60).length,
    });
  } catch (error) {
    console.error('[LEAD PRIORITIZATION ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
