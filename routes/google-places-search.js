import express from 'express';

import { generateEmail, isMobileNumber } from '../lib/google-places-search.js';

const router = express.Router();

// Google Places Search API endpoint (extracted from server.js)
router.post('/api/search-google-places', async (req, res) => {
  console.log('[SEARCH REQUEST] Received request:', req.body);
  
  // Set a 300-second timeout to prevent 504 errors on large searches
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Request timeout', 
        message: 'The request took too long to process. Please try again with a smaller search scope.' 
      });
    }
  }, 1200000); // 1200 seconds (20 minutes) for comprehensive searches
  
  try {
    const { query, location, maxResults = 20, businessSize, mobileOnly, decisionMakerTitles } = req.body;
    
    console.log('[SEARCH REQUEST] Parsed parameters:', { query, location, maxResults, businessSize, mobileOnly, decisionMakerTitles });
    
    if (!query || !location) {
      console.log('[SEARCH REQUEST] Missing required fields:', { query: !!query, location: !!location });
      clearTimeout(timeout);
      return res.status(400).json({
        success: false,
        error: 'Query and location are required'
      });
    }
    
    // Check if Google Places API key is available
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      clearTimeout(timeout);
      return res.status(500).json({
        success: false,
        error: 'Google Places API key not configured'
      });
    }
    
    console.log(`[GOOGLE PLACES SEARCH] Searching for "${query}" in "${location}"`);
    
    // Search Google Places - use multiple search strategies to get more results
    const searchQueries = [];
    
    if (location === 'United Kingdom') {
      // Create comprehensive search variations for UK - maximum coverage for higher targets
      searchQueries.push(query + ' UK');
      searchQueries.push(query + ' London');
      searchQueries.push(query + ' Manchester');
      searchQueries.push(query + ' Birmingham');
      searchQueries.push(query + ' Glasgow');
      searchQueries.push(query + ' Edinburgh');
      searchQueries.push(query + ' Liverpool');
      searchQueries.push(query + ' Bristol');
      searchQueries.push(query + ' Leeds');
      searchQueries.push(query + ' Newcastle');
      searchQueries.push(query + ' Sheffield');
      searchQueries.push(query + ' Nottingham');
      searchQueries.push(query + ' Cardiff');
      searchQueries.push(query + ' Belfast');
      
      // Add more UK cities for broader coverage
      searchQueries.push(query + ' Portsmouth');
      searchQueries.push(query + ' Plymouth');
      searchQueries.push(query + ' Exeter');
      searchQueries.push(query + ' Bath');
      searchQueries.push(query + ' Norwich');
      searchQueries.push(query + ' Ipswich');
      searchQueries.push(query + ' Colchester');
      searchQueries.push(query + ' Chelmsford');
      searchQueries.push(query + ' Slough');
      searchQueries.push(query + ' Milton Keynes');
      searchQueries.push(query + ' Northampton');
      searchQueries.push(query + ' Coventry');
      searchQueries.push(query + ' Wolverhampton');
      searchQueries.push(query + ' Stoke-on-Trent');
      searchQueries.push(query + ' Chester');
      searchQueries.push(query + ' Middlesbrough');
      searchQueries.push(query + ' Sunderland');
      searchQueries.push(query + ' Durham');
      searchQueries.push(query + ' Dundee');
      searchQueries.push(query + ' Stirling');
      searchQueries.push(query + ' Perth');
      searchQueries.push(query + ' Inverness');
      searchQueries.push(query + ' Newport');
      searchQueries.push(query + ' Wrexham');
      searchQueries.push(query + ' Bangor');
      searchQueries.push(query + ' Newry');
      searchQueries.push(query + ' Derry');
      searchQueries.push(query + ' Armagh');
      searchQueries.push(query + ' Lisburn');
      searchQueries.push(query + ' Craigavon');
      
      // Comprehensive UK cities for maximum coverage - restored for better results
      searchQueries.push(query + ' Reading');
      searchQueries.push(query + ' Oxford');
      searchQueries.push(query + ' Cambridge');
      searchQueries.push(query + ' Canterbury');
      searchQueries.push(query + ' Brighton');
      searchQueries.push(query + ' Hastings');
      searchQueries.push(query + ' Eastbourne');
      searchQueries.push(query + ' Worthing');
      searchQueries.push(query + ' Crawley');
      searchQueries.push(query + ' Guildford');
      searchQueries.push(query + ' Woking');
      searchQueries.push(query + ' Farnborough');
      searchQueries.push(query + ' Aldershot');
      searchQueries.push(query + ' Winchester');
      searchQueries.push(query + ' Southampton');
      searchQueries.push(query + ' Bournemouth');
      searchQueries.push(query + ' Poole');
      searchQueries.push(query + ' Weymouth');
      searchQueries.push(query + ' Dorchester');
      searchQueries.push(query + ' Salisbury');
      searchQueries.push(query + ' Swindon');
      searchQueries.push(query + ' Gloucester');
      searchQueries.push(query + ' Cheltenham');
      searchQueries.push(query + ' Worcester');
      searchQueries.push(query + ' Hereford');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Halesowen');
      searchQueries.push(query + ' Oldbury');
      searchQueries.push(query + ' Smethwick');
      searchQueries.push(query + ' West Bromwich');
      searchQueries.push(query + ' Wednesbury');
      searchQueries.push(query + ' Bilston');
      searchQueries.push(query + ' Willenhall');
      searchQueries.push(query + ' Darlaston');
      searchQueries.push(query + ' Tipton');
      searchQueries.push(query + ' Coseley');
      searchQueries.push(query + ' Sedgley');
      searchQueries.push(query + ' Gornal');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Stourton');
      searchQueries.push(query + ' Wordsley');
      searchQueries.push(query + ' Amblecote');
      searchQueries.push(query + ' Lye');
      searchQueries.push(query + ' Cradley Heath');
      searchQueries.push(query + ' Netherton');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Pensnett');
      searchQueries.push(query + ' Russells Hall');
      searchQueries.push(query + ' Pedmore');
      searchQueries.push(query + ' Hagley');
      searchQueries.push(query + ' Belbroughton');
      searchQueries.push(query + ' Chaddesley Corbett');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Studley');
      searchQueries.push(query + ' Alcester');
      searchQueries.push(query + ' Stratford-upon-Avon');
      searchQueries.push(query + ' Warwick');
      searchQueries.push(query + ' Leamington Spa');
      searchQueries.push(query + ' Kenilworth');
      searchQueries.push(query + ' Rugby');
      searchQueries.push(query + ' Daventry');
      searchQueries.push(query + ' Towcester');
      searchQueries.push(query + ' Brackley');
      searchQueries.push(query + ' Banbury');
      searchQueries.push(query + ' Bicester');
      searchQueries.push(query + ' Witney');
      searchQueries.push(query + ' Carterton');
      searchQueries.push(query + ' Burford');
      searchQueries.push(query + ' Chipping Norton');
      searchQueries.push(query + ' Woodstock');
      searchQueries.push(query + ' Kidlington');
      searchQueries.push(query + ' Abingdon');
      searchQueries.push(query + ' Didcot');
      searchQueries.push(query + ' Wantage');
      searchQueries.push(query + ' Faringdon');
      searchQueries.push(query + ' Wallingford');
      searchQueries.push(query + ' Thame');
      searchQueries.push(query + ' Aylesbury');
      searchQueries.push(query + ' High Wycombe');
      searchQueries.push(query + ' Beaconsfield');
      searchQueries.push(query + ' Amersham');
      searchQueries.push(query + ' Chesham');
      searchQueries.push(query + ' Tring');
      searchQueries.push(query + ' Berkhamsted');
      searchQueries.push(query + ' Hemel Hempstead');
      searchQueries.push(query + ' Watford');
      searchQueries.push(query + ' St Albans');
      searchQueries.push(query + ' Harpenden');
      searchQueries.push(query + ' Welwyn Garden City');
      searchQueries.push(query + ' Hatfield');
      searchQueries.push(query + ' Stevenage');
      searchQueries.push(query + ' Letchworth');
      searchQueries.push(query + ' Hitchin');
      searchQueries.push(query + ' Baldock');
      searchQueries.push(query + ' Royston');
      searchQueries.push(query + ' Bishop\'s Stortford');
      searchQueries.push(query + ' Sawbridgeworth');
      searchQueries.push(query + ' Harlow');
      searchQueries.push(query + ' Epping');
      searchQueries.push(query + ' Ongar');
      searchQueries.push(query + ' Brentwood');
      searchQueries.push(query + ' Billericay');
      searchQueries.push(query + ' Wickford');
      searchQueries.push(query + ' Rayleigh');
      searchQueries.push(query + ' Southend-on-Sea');
      searchQueries.push(query + ' Leigh-on-Sea');
      searchQueries.push(query + ' Westcliff-on-Sea');
      searchQueries.push(query + ' Shoeburyness');
      searchQueries.push(query + ' Rochford');
      searchQueries.push(query + ' Hockley');
      searchQueries.push(query + ' Rayleigh');
      searchQueries.push(query + ' Wickford');
      searchQueries.push(query + ' Billericay');
      searchQueries.push(query + ' Brentwood');
      searchQueries.push(query + ' Ongar');
      searchQueries.push(query + ' Epping');
      searchQueries.push(query + ' Harlow');
      searchQueries.push(query + ' Sawbridgeworth');
      searchQueries.push(query + ' Bishop\'s Stortford');
      searchQueries.push(query + ' Royston');
      searchQueries.push(query + ' Baldock');
      searchQueries.push(query + ' Hitchin');
      searchQueries.push(query + ' Letchworth');
      searchQueries.push(query + ' Stevenage');
      searchQueries.push(query + ' Hatfield');
      searchQueries.push(query + ' Welwyn Garden City');
      searchQueries.push(query + ' Harpenden');
      searchQueries.push(query + ' St Albans');
      searchQueries.push(query + ' Watford');
      searchQueries.push(query + ' Hemel Hempstead');
      searchQueries.push(query + ' Berkhamsted');
      searchQueries.push(query + ' Tring');
      searchQueries.push(query + ' Chesham');
      searchQueries.push(query + ' Amersham');
      searchQueries.push(query + ' Beaconsfield');
      searchQueries.push(query + ' High Wycombe');
      searchQueries.push(query + ' Aylesbury');
      searchQueries.push(query + ' Thame');
      searchQueries.push(query + ' Wallingford');
      searchQueries.push(query + ' Faringdon');
      searchQueries.push(query + ' Wantage');
      searchQueries.push(query + ' Didcot');
      searchQueries.push(query + ' Abingdon');
      searchQueries.push(query + ' Kidlington');
      searchQueries.push(query + ' Woodstock');
      searchQueries.push(query + ' Chipping Norton');
      searchQueries.push(query + ' Burford');
      searchQueries.push(query + ' Carterton');
      searchQueries.push(query + ' Witney');
      searchQueries.push(query + ' Bicester');
      searchQueries.push(query + ' Banbury');
      searchQueries.push(query + ' Brackley');
      searchQueries.push(query + ' Towcester');
      searchQueries.push(query + ' Daventry');
      searchQueries.push(query + ' Rugby');
      searchQueries.push(query + ' Kenilworth');
      searchQueries.push(query + ' Leamington Spa');
      searchQueries.push(query + ' Warwick');
      searchQueries.push(query + ' Stratford-upon-Avon');
      searchQueries.push(query + ' Alcester');
      searchQueries.push(query + ' Studley');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Chaddesley Corbett');
      searchQueries.push(query + ' Belbroughton');
      searchQueries.push(query + ' Hagley');
      searchQueries.push(query + ' Pedmore');
      searchQueries.push(query + ' Russells Hall');
      searchQueries.push(query + ' Pensnett');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Netherton');
      searchQueries.push(query + ' Cradley Heath');
      searchQueries.push(query + ' Lye');
      searchQueries.push(query + ' Amblecote');
      searchQueries.push(query + ' Wordsley');
      searchQueries.push(query + ' Stourton');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Sedgley');
      searchQueries.push(query + ' Coseley');
      searchQueries.push(query + ' Tipton');
      searchQueries.push(query + ' Darlaston');
      searchQueries.push(query + ' Willenhall');
      searchQueries.push(query + ' Bilston');
      searchQueries.push(query + ' Wednesbury');
      searchQueries.push(query + ' West Bromwich');
      searchQueries.push(query + ' Smethwick');
      searchQueries.push(query + ' Oldbury');
      searchQueries.push(query + ' Halesowen');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Hereford');
      searchQueries.push(query + ' Worcester');
      searchQueries.push(query + ' Cheltenham');
      searchQueries.push(query + ' Gloucester');
      searchQueries.push(query + ' Swindon');
      searchQueries.push(query + ' Salisbury');
      searchQueries.push(query + ' Dorchester');
      searchQueries.push(query + ' Weymouth');
      searchQueries.push(query + ' Poole');
      searchQueries.push(query + ' Bournemouth');
      searchQueries.push(query + ' Southampton');
      searchQueries.push(query + ' Winchester');
      searchQueries.push(query + ' Aldershot');
      searchQueries.push(query + ' Farnborough');
      searchQueries.push(query + ' Woking');
      searchQueries.push(query + ' Guildford');
      searchQueries.push(query + ' Crawley');
      searchQueries.push(query + ' Worthing');
      searchQueries.push(query + ' Eastbourne');
      searchQueries.push(query + ' Hastings');
      searchQueries.push(query + ' Brighton');
      searchQueries.push(query + ' Canterbury');
      searchQueries.push(query + ' Cambridge');
      searchQueries.push(query + ' Oxford');
      searchQueries.push(query + ' Reading');
    } else {
      searchQueries.push(query + ' ' + location);
    }
    
    // Add mobile-friendly terms to increase chances of finding mobile numbers
    const mobileFriendlyTerms = ['owner', 'director', 'consultant', 'advisor', 'specialist', 'private', 'independent', 'solo'];
    const hasMobileTerms = mobileFriendlyTerms.some(term => 
      query.toLowerCase().includes(term.toLowerCase())
    );
    
    if (!hasMobileTerms && !query.includes('\"') && !query.includes('"')) {
      // Add mobile-friendly variations - these business types more likely to have mobile numbers
      if (location === 'United Kingdom') {
        searchQueries.push(query + ' \"private\" UK');
        searchQueries.push(query + ' \"consultant\" UK');
        searchQueries.push(query + ' \"independent\" UK');
        searchQueries.push(query + ' \"solo\" UK');
        searchQueries.push(query + ' \"owner\" UK');
        searchQueries.push(query + ' \"director\" UK');
        searchQueries.push(query + ' \"specialist\" UK');
        searchQueries.push(query + ' \"advisor\" UK');
        searchQueries.push(query + ' \"freelance\" UK');
        // Add more variations to get more results
        searchQueries.push(query + ' \"mobile\" UK');
        searchQueries.push(query + ' \"personal\" UK');
        searchQueries.push(query + ' \"individual\" UK');
        searchQueries.push(query + ' \"self-employed\" UK');
        searchQueries.push(query + ' \"sole trader\" UK');
      } else {
        searchQueries.push(query + ' \"private\" ' + location);
        searchQueries.push(query + ' \"consultant\" ' + location);
        searchQueries.push(query + ' \"advisor\" ' + location);
        searchQueries.push(query + ' \"independent\" ' + location);
        searchQueries.push(query + ' \"solo\" ' + location);
        searchQueries.push(query + ' \"owner\" ' + location);
        searchQueries.push(query + ' \"director\" ' + location);
        searchQueries.push(query + ' \"specialist\" ' + location);
        searchQueries.push(query + ' \"advisor\" ' + location);
        searchQueries.push(query + ' \"freelance\" ' + location);
      }
    }
    
    const allResults = [];
    
    // Real Google Places API calls with conservative settings
    console.log(`[GOOGLE PLACES] Starting search with ${searchQueries.length} queries`);
    
    const maxPages = 3; // Increased pagination for even more results per city
    const queryDelay = 200; // Fast processing - reduced delay for speed
    
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      console.log(`[GOOGLE PLACES] Searching: \"${searchQuery}\" (${i + 1}/${searchQueries.length})`);
      
      try {
        // Search for places
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        // Check for Google Places API errors
        if (searchData.error_message) {
          console.error(`[GOOGLE PLACES ERROR] ${searchData.error_message}`);
          continue; // Skip this query and continue with the next one
        }
        
        if (searchData.results && searchData.results.length > 0) {
          allResults.push(...searchData.results);
          console.log(`[GOOGLE PLACES] Found ${searchData.results.length} results for \"${searchQuery}\"`);
          
          // Handle pagination with conservative limits
          let nextPageToken = searchData.next_page_token;
          let pageCount = 1;
          
          while (nextPageToken && pageCount < maxPages) {
            console.log(`[GOOGLE PLACES] Getting page ${pageCount + 1} for \"${searchQuery}\"`);
            
            // Wait for next page token to be valid (Google requires this)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const nextPageUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${apiKey}`;
            const nextPageResponse = await fetch(nextPageUrl);
            const nextPageData = await nextPageResponse.json();
            
            // Check for Google Places API errors
            if (nextPageData.error_message) {
              console.error(`[GOOGLE PLACES PAGINATION ERROR] ${nextPageData.error_message}`);
              break; // Stop pagination for this query
            }
            
            if (nextPageData.results && nextPageData.results.length > 0) {
              allResults.push(...nextPageData.results);
              console.log(`[GOOGLE PLACES] Found ${nextPageData.results.length} more results on page ${pageCount + 1}`);
              nextPageToken = nextPageData.next_page_token;
              pageCount++;
            } else {
              break;
            }
          }
        } else {
          console.log(`[GOOGLE PLACES] No results found for \"${searchQuery}\"`);
        }
        
        // Delay between queries to prevent rate limiting
        if (i < searchQueries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, queryDelay));
        }
        
      } catch (error) {
        console.error(`[GOOGLE PLACES ERROR] Failed to search \"${searchQuery}\":`, error.message);
        // Continue with next query instead of failing completely
      }
    }
    
    console.log(`[GOOGLE PLACES] Total results collected: ${allResults.length}`);
    
    if (allResults.length === 0) {
      console.error(`[GOOGLE PLACES ERROR] No results found from any query`);
      return res.status(400).json({
        success: false,
        error: 'No businesses found for the given search criteria'
      });
    }
    
    // Real processing with conservative chunked approach
    const results = [];
    const targetMobileNumbers = maxResults; // This is just for logging/target purposes
    const chunkSize = 100; // Large chunk size for fast processing
    const chunkDelay = 100; // Minimal delay for fast processing

    console.log(`[PROCESSING] Processing ${allResults.length} results in chunks of ${chunkSize}, target: ${targetMobileNumbers} mobile numbers`);
    console.log(`[DEBUG] maxResults: ${maxResults}, targetMobileNumbers: ${targetMobileNumbers}`);
    console.log(`[NOTE] Will return ALL mobile numbers found, not limited to ${targetMobileNumbers}`);

    // Process results in small chunks to prevent server overload
    for (let i = 0; i < allResults.length; i += chunkSize) {
      const chunk = allResults.slice(i, i + chunkSize);
      console.log(`[PROCESSING] Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allResults.length / chunkSize)} (${chunk.length} businesses)`);

      // Continue processing until ALL businesses are checked - no early exit
      console.log(`[PROGRESS] Found ${results.length}/${targetMobileNumbers} mobile numbers so far, continuing...`);

      for (const place of chunk) {
        try {
          // Get detailed information for each place (including reviews for pain point analysis)
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,reviews,rating&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();

          // Check for Google Places API errors
          if (detailsData.error_message) {
            console.error(`[GOOGLE PLACES DETAILS ERROR] ${detailsData.error_message}`);
            continue; // Skip this business and continue with the next one
          }

          if (detailsData.result) {
            const phone = detailsData.result.formatted_phone_number;
            let isMobile = phone ? isMobileNumber(phone) : false;
            let phoneValidation = null;
            let reviewsAnalysis = null;
            
            // Analyze Google reviews for pain points (free, already included in API response)
            if (detailsData.result.reviews && detailsData.result.reviews.length > 0) {
              const { analyzeReviewsForPainPoints, calculateReviewScore, generatePersonalizedPitch } = await import('../lib/reviews-analysis.js');
              reviewsAnalysis = analyzeReviewsForPainPoints(detailsData.result.reviews);
              reviewsAnalysis.score = calculateReviewScore(reviewsAnalysis);
              reviewsAnalysis.personalizedPitch = generatePersonalizedPitch(reviewsAnalysis, { 
                name: detailsData.result.name 
              });
              
              console.log(`[REVIEWS] ${detailsData.result.name}: ${reviewsAnalysis.painPoints.length} pain points, score: ${reviewsAnalysis.score}`);
            }
            
            // Optional: Validate phone number with Twilio Lookup API (costs $0.005/number)
            // Enable with query parameter: ?validatePhones=true
            if (phone && req.query.validatePhones === 'true') {
              const { validatePhoneNumber, isPhoneValidationEnabled } = await import('../lib/phone-validation.js');
              if (isPhoneValidationEnabled()) {
                phoneValidation = await validatePhoneNumber(phone);
                // Override isMobile with validated data
                if (phoneValidation.validated) {
                  isMobile = phoneValidation.lineType === 'mobile' && phoneValidation.recommended;
                  console.log(`[PHONE VALIDATED] ${detailsData.result.name}: ${phone} -> ${phoneValidation.lineType} (risk: ${phoneValidation.riskLevel})`);
                }
              }
            }
            
            // Debug logging for mobile detection
            if (phone) {
              console.log(`[PHONE CHECK] ${detailsData.result.name}: ${phone} -> Mobile: ${isMobile}${phoneValidation ? ' (validated)' : ''}${reviewsAnalysis ? ` | Reviews: ${reviewsAnalysis.score}/100` : ''}`);
            }

            const business = {
              name: detailsData.result.name || place.name,
              phone: phone || 'No phone listed',
              hasMobile: isMobile,
              email: generateEmail(detailsData.result.name || place.name),
              website: detailsData.result.website || place.website,
              address: detailsData.result.formatted_address || place.formatted_address,
              rating: detailsData.result.rating || 0,
              industry: query,
              source: 'Google Places',
              businessSize: 'Solo',
              mobileLikelihood: 8,
              verified: true,
              isUKBusiness: true,
              // Add validation data if available
              ...(phoneValidation && {
                phoneValidation: {
                  lineType: phoneValidation.lineType,
                  carrier: phoneValidation.carrier,
                  riskScore: phoneValidation.riskScore,
                  riskLevel: phoneValidation.riskLevel,
                  validated: phoneValidation.validated,
                  validatedAt: phoneValidation.validatedAt
                }
              }),
              // Add reviews analysis if available
              ...(reviewsAnalysis && {
                reviewsAnalysis: {
                  painPoints: reviewsAnalysis.painPoints,
                  opportunities: reviewsAnalysis.opportunities,
                  sentiment: reviewsAnalysis.sentiment,
                  avgRating: reviewsAnalysis.avgRating,
                  totalReviews: reviewsAnalysis.totalReviews,
                  score: reviewsAnalysis.score,
                  personalizedPitch: reviewsAnalysis.personalizedPitch
                }
              })
            };

            results.push(business);
          }
        } catch (error) {
          console.error(`[PROCESSING ERROR] Failed to get details for ${place.name}:`, error.message);
          // Continue processing other businesses
        }
      }

      // Delay between chunks to prevent server overload
      if (i + chunkSize < allResults.length) {
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }
    }

    const finalMobileCount = results.filter(r => r.hasMobile).length;
    console.log(`[PROCESSING COMPLETE] Found ${results.length} total businesses, ${finalMobileCount} with mobile numbers (Target: ${targetMobileNumbers})`);
    
    console.log('[SEARCH RESPONSE] Sending response with', results.length, 'results');
    
    // Check if response was already sent (timeout case)
    if (res.headersSent) {
      console.log('[SEARCH RESPONSE] Response already sent, skipping');
      return;
    }
    
    // Clear the timeout since request completed successfully
    clearTimeout(timeout);
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      mobileCount: finalMobileCount,
      targetMobileNumbers: targetMobileNumbers,
      processed: allResults.length,
      requested: maxResults,
      targetReached: finalMobileCount >= targetMobileNumbers
    });
    
  } catch (error) {
    console.error('[GOOGLE PLACES SEARCH ERROR]', error);
    
    // Clear the timeout since request completed (with error)
    clearTimeout(timeout);
    
    // Check if response was already sent (timeout case)
    if (res.headersSent) {
      console.log('[SEARCH ERROR] Response already sent, skipping error response');
      return;
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

