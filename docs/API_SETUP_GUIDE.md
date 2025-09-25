# 🚀 Real UK Business Search API Setup Guide

## **Overview**
This guide will help you set up real API integrations to search for actual UK businesses with live contact details.

## **Required API Keys**

### **1. Google Places API (Recommended)**
**What it does**: Searches Google's database of real businesses worldwide
**Cost**: $0.017 per request (first $200 free per month)
**Coverage**: Excellent for UK businesses

#### **Setup Steps**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Places API" and "Places API (New)"
4. Create credentials → API Key
5. Restrict the key to Places API only
6. Add to your `.env` file:
   ```
   GOOGLE_PLACES_API_KEY=your_api_key_here
   ```

### **2. Companies House API (Free)**
**What it does**: Official UK company registry data
**Cost**: Free (with rate limits)
**Coverage**: All UK registered companies

#### **Setup Steps**:
1. Go to [Companies House Developer Hub](https://developer.company-information.service.gov.uk/)
2. Sign up for a free account
3. Create an API key
4. Add to your `.env` file:
   ```
   COMPANIES_HOUSE_API_KEY=your_api_key_here
   ```

### **3. Yell.com API (Optional)**
**What it does**: UK business directory with contact details
**Cost**: Paid service
**Coverage**: Good for local businesses

#### **Setup Steps**:
1. Contact Yell.com for API access
2. Get API key and documentation
3. Add to your `.env` file:
   ```
   YELL_API_KEY=your_api_key_here
   ```

## **Environment Variables Setup**

Create or update your `.env` file:

```env
# UK Business Search APIs
GOOGLE_PLACES_API_KEY=your_google_places_api_key
COMPANIES_HOUSE_API_KEY=your_companies_house_api_key
YELL_API_KEY=your_yell_api_key

# Optional: OpenCorporates API (free tier available)
OPEN_CORPORATES_API_KEY=your_open_corporates_api_key
```

## **Testing Your Setup**

### **1. Test Google Places API**
```bash
curl "https://maps.googleapis.com/maps/api/place/textsearch/json?query=dental+practices+in+London&key=YOUR_API_KEY&region=uk"
```

### **2. Test Companies House API**
```bash
curl -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
"https://api.company-information.service.gov.uk/search/companies?q=dental"
```

### **3. Test Your Server**
```bash
# Start your server
npm start

# Test the endpoint
curl -X POST http://localhost:10000/api/uk-business-search \
-H "Content-Type: application/json" \
-d '{"query": "dental practices", "filters": {"location": "London", "limit": 10}}'
```

## **API Limits & Costs**

### **Google Places API**
- **Free Tier**: $200 credit per month
- **Cost**: $0.017 per text search request
- **Rate Limit**: 100 requests per 100 seconds
- **Daily Limit**: 100,000 requests

### **Companies House API**
- **Free Tier**: 600 requests per day
- **Rate Limit**: 600 requests per day
- **No cost**: Completely free

### **Yell.com API**
- **Cost**: Contact for pricing
- **Rate Limit**: Varies by plan
- **Coverage**: UK businesses only

## **Optimization Tips**

### **1. Caching**
- Results are cached for 24 hours
- Reduces API calls and costs
- Improves response times

### **2. Rate Limiting**
- Built-in rate limiting prevents API overuse
- Automatic retry with exponential backoff
- Graceful fallback to sample data

### **3. Smart Filtering**
- Filter by location to reduce API calls
- Use specific business types for better results
- Limit results to avoid unnecessary API usage

## **Expected Results**

### **With Google Places API**:
- **Real business names** and addresses
- **Phone numbers** (when available)
- **Website URLs** (when available)
- **Ratings and reviews**
- **Opening hours**
- **Business categories**

### **With Companies House API**:
- **Official company names**
- **Registered addresses**
- **Company status** (active/dissolved)
- **Company type** (limited company, etc.)
- **Date of incorporation**
- **SIC codes** (business activities)

## **Troubleshooting**

### **Common Issues**:

1. **"API key not found"**
   - Check your `.env` file
   - Restart your server after adding keys
   - Verify key format (no spaces, quotes)

2. **"Quota exceeded"**
   - Check your API usage in Google Cloud Console
   - Wait for quota reset (daily/monthly)
   - Consider upgrading your plan

3. **"No results found"**
   - Try different search terms
   - Check if location filter is too restrictive
   - Verify API key has correct permissions

4. **"Rate limit exceeded"**
   - Reduce concurrent requests
   - Implement request queuing
   - Use caching to reduce API calls

### **Debug Mode**:
Enable debug logging by setting:
```env
DEBUG=uk-business-search:*
```

## **Production Deployment**

### **Security**:
- Never commit API keys to version control
- Use environment variables only
- Restrict API keys to specific IPs/domains
- Monitor API usage regularly

### **Monitoring**:
- Track API usage and costs
- Monitor response times
- Set up alerts for quota limits
- Log search patterns for optimization

## **Cost Estimation**

### **Monthly Usage Example**:
- **1,000 searches** = $17 (Google Places)
- **Companies House**: Free
- **Total**: ~$17/month for 1,000 searches

### **Break-even Analysis**:
- **Cost per search**: $0.017
- **Average deal value**: £1,500
- **Conversion rate**: 5%
- **Break-even**: 1 deal per 588 searches

## **Next Steps**

1. **Set up Google Places API** (most important)
2. **Set up Companies House API** (free)
3. **Test with sample searches**
4. **Monitor usage and costs**
5. **Scale up based on results**

## **Support**

If you need help setting up any of these APIs:
- **Google Places**: [Google Cloud Support](https://cloud.google.com/support)
- **Companies House**: [Developer Hub](https://developer.company-information.service.gov.uk/)
- **General Issues**: Check server logs for detailed error messages

---

**Ready to search real UK businesses? Start with Google Places API!** 🚀
