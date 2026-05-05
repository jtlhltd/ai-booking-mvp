import { Router } from 'express';

import { generateUKBusinesses, getIndustryCategories } from '../lib/enhanced-business-search.js';
import { isMobileNumber } from '../lib/google-places-search.js';

export function createCompanyEnrichmentRouter() {
  const router = Router();

  // UK Business Search endpoint (PUBLIC - no auth required) - WITH REAL API
  // FILTERS FOR MOBILE NUMBERS ONLY BY DEFAULT
  router.post('/api/uk-business-search', async (req, res) => {
    try {
      const { query, filters = {} } = req.body;

      // Default to mobiles only unless explicitly disabled
      const mobilesOnly = filters.mobilesOnly !== false;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      console.log(`[UK BUSINESS SEARCH] Starting real search for: \"${query}\"`);

      // Try real API first, fallback to sample data
      let results = [];
      let usingRealData = false;

      try {
        // Debug API keys
        console.log(`[UK BUSINESS SEARCH] API Keys Status:`, {
          googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
          companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET',
        });

        // Dynamic import of real API module
        const realSearchModule = await import('../lib/real-uk-business-search.js');
        const RealUKBusinessSearch = realSearchModule.default;

        const realSearcher = new RealUKBusinessSearch();
        results = await realSearcher.searchBusinesses(query, filters);
        usingRealData = true;
        console.log(`[UK BUSINESS SEARCH] Real API search found ${results.length} businesses`);
      } catch (realApiError) {
        console.log(
          `[UK BUSINESS SEARCH] Real API failed, falling back to sample data:`,
          realApiError.message,
        );

        // Fallback to enhanced sample data with filters
        results = generateUKBusinesses(query, filters);
      }

      // Filter for mobile numbers only if requested
      if (mobilesOnly) {
        const beforeFilter = results.length;
        results = results.filter((business) => {
          const hasMobile = isMobileNumber(business.phone);
          if (!hasMobile) {
            console.log(`[MOBILE FILTER] Rejected ${business.name}: ${business.phone} (landline)`);
          }
          return hasMobile;
        });
        console.log(`[MOBILE FILTER] Filtered ${beforeFilter} → ${results.length} businesses (mobiles only)`);
      }

      res.json({
        success: true,
        results,
        count: results.length,
        query,
        filters: { ...filters, mobilesOnly },
        usingRealData,
        mobilesFiltered: mobilesOnly,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[UK BUSINESS SEARCH ERROR]', error);
      res.status(500).json({
        error: 'Failed to search businesses',
        message: error.message,
      });
    }
  });

  // Decision Maker Contact Research endpoint (PUBLIC - no auth required) - WITH REAL API
  router.post('/api/decision-maker-contacts', async (req, res) => {
    // Set a 30-second timeout to prevent 502 errors
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Request timeout',
          message: 'The request took too long to process. Please try again with a smaller search scope.',
        });
      }
    }, 30000);
    if (typeof timeout?.unref === 'function') timeout.unref();
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    try {
      const { business, industry, targetRole } = req.body;

      if (!business || !industry || !targetRole) {
        clearTimeout(timeout);
        return res.status(400).json({
          error: 'Business, industry, and targetRole are required',
        });
      }

      console.log(
        `[DECISION MAKER CONTACT] Researching contacts for ${targetRole} at ${business.name}`,
      );
      console.log(`[DECISION MAKER CONTACT] Business data:`, {
        name: business.name,
        website: business.website,
        address: business.address,
      });

      // Try real API first, fallback to empty data (no fake contacts)
      let contacts;
      let strategy;

      try {
        const contactFinderModule = await import('../lib/real-decision-maker-contact-finder.js');
        const RealDecisionMakerContactFinder = contactFinderModule.default;
        const contactFinder = new RealDecisionMakerContactFinder();

        // Set a 5-second timeout for the entire research process
        const result = await Promise.race([
          Promise.all([
            contactFinder.findDecisionMakerContacts(business, industry, targetRole),
            contactFinder.generateOutreachStrategy({ primary: [], secondary: [], gatekeeper: [] }, business, industry, targetRole),
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Contact research timed out after 5 seconds')), 5000),
          ),
        ]);

        const [foundContacts, outreachStrategy] = result;
        contacts = foundContacts;
        strategy = outreachStrategy;

        if (
          (contacts.primary?.length || 0) > 0 ||
          (contacts.secondary?.length || 0) > 0 ||
          (contacts.gatekeeper?.length || 0) > 0
        ) {
          contacts.found = true;
          console.log(`[DECISION MAKER CONTACT] Real API successful - contacts found`);
        } else {
          contacts.found = false;
          console.log(
            `[DECISION MAKER CONTACT] Real API returned empty contacts - no decision makers found`,
          );

          contacts = { primary: [], secondary: [], gatekeeper: [], found: false };

          strategy = {
            approach: 'No decision makers found',
            message:
              'No decision maker contacts found for this business. The business may not be registered with Companies House or may not have active directors.',
            followUp:
              'Try manual research methods: LinkedIn search, company website, or Google search',
            bestTime: 'N/A',
          };
        }
      } catch (realApiError) {
        console.log(`[DECISION MAKER CONTACT] Real API failed:`, realApiError.message);

        if (realApiError.message.includes('timed out')) {
          contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
          strategy = {
            approach: 'Research timed out',
            message: 'The search is taking longer than expected. Please try again.',
            followUp: 'Try again with a different business or check your internet connection',
            bestTime: 'N/A',
          };
        } else {
          console.log(`[DECISION MAKER CONTACT] Real API failed - no fallback contacts generated`);
          contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
          strategy = {
            approach: 'API failed',
            message:
              'Unable to retrieve decision maker contacts. The search service may be temporarily unavailable.',
            followUp: 'Try again later or use manual research methods',
            bestTime: 'N/A',
          };
        }
      }

      console.log(`[DECISION MAKER CONTACT] Returning contacts:`, {
        primaryCount: contacts.primary.length,
        secondaryCount: contacts.secondary.length,
        gatekeeperCount: contacts.gatekeeper.length,
        found: contacts.found,
      });

      res.json({
        success: true,
        contacts,
        strategy,
        business,
        industry,
        targetRole,
        timestamp: new Date().toISOString(),
      });

      clearTimeout(timeout);
    } catch (error) {
      console.error('[DECISION MAKER CONTACT ERROR]', error);
      clearTimeout(timeout);
      res.status(500).json({
        error: 'Failed to research decision maker contacts',
        message: error.message,
      });
    }
  });

  // Get industry categories endpoint (PUBLIC - no auth required)
  router.get('/api/industry-categories', (_req, res) => {
    try {
      const categories = getIndustryCategories();
      res.json({
        success: true,
        categories,
        total: categories.length,
      });
    } catch (error) {
      console.error('[INDUSTRY CATEGORIES ERROR]', error);
      res.status(500).json({
        error: 'Failed to get industry categories',
        message: error.message,
      });
    }
  });

  return router;
}

