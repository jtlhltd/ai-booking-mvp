# Real Data API Setup Guide

To get **actual decision maker contacts** instead of generated data, you need to configure these API keys:

## 🔑 Required API Keys

### 1. Companies House API (FREE)
**What it does**: Gets real company officers, directors, and owners from UK companies
**Cost**: Completely FREE
**Setup**:
1. Go to: https://developer.company-information.service.gov.uk/
2. Sign up for a free account
3. Create a new application
4. Copy your API key
5. Set environment variable: `COMPANIES_HOUSE_API_KEY=your_key_here`

### 2. Google Custom Search API (FREE tier available)
**What it does**: Searches for public business owner information on LinkedIn, Facebook, etc.
**Cost**: FREE tier: 100 searches/day
**Setup**:
1. Go to: https://console.cloud.google.com/
2. Create a new project
3. Enable "Custom Search API"
4. Create credentials (API key)
5. Create a Custom Search Engine at: https://cse.google.com/
6. Set environment variables:
   - `GOOGLE_SEARCH_API_KEY=your_key_here`
   - `GOOGLE_SEARCH_ENGINE_ID=your_engine_id`

### 3. LinkedIn Sales Navigator API (PAID)
**What it does**: Gets real LinkedIn profiles of business owners and managers
**Cost**: Requires LinkedIn Sales Navigator subscription (~$80/month)
**Setup**:
1. Subscribe to LinkedIn Sales Navigator
2. Apply for LinkedIn API access
3. Get API credentials
4. Set environment variable: `LINKEDIN_API_KEY=your_key_here`

## 🚀 Quick Setup (Free Options Only)

For immediate testing with **real data**, set up just the Companies House API:

```bash
# In your Render environment variables:
COMPANIES_HOUSE_API_KEY=your_companies_house_key_here
```

This will give you:
- ✅ Real company officers from Companies House
- ✅ Actual director names and titles
- ✅ Real company information
- ✅ Website scraping for team pages
- ✅ Realistic LinkedIn profiles based on business names

## 📊 What Each API Provides

### Companies House API
- **Real company officers**: Names, titles, appointment dates
- **Company information**: Registration details, status, address
- **Confidence**: 90% (official government data)

### Google Search API
- **Public profiles**: LinkedIn, Facebook business pages
- **News articles**: Business owner mentions
- **Social media**: Public contact information
- **Confidence**: 70-80% (public information)

### LinkedIn Sales Navigator API
- **Professional profiles**: Real LinkedIn profiles
- **Contact details**: Email, phone (if public)
- **Professional titles**: Current and past positions
- **Confidence**: 85-95% (professional network)

## 🔧 Environment Variables Setup

Add these to your Render environment variables:

```bash
# Required for real data
COMPANIES_HOUSE_API_KEY=your_key_here

# Optional but recommended
GOOGLE_SEARCH_API_KEY=your_key_here
GOOGLE_SEARCH_ENGINE_ID=your_engine_id

# Premium option
LINKEDIN_API_KEY=your_key_here
```

## 🎯 Expected Results

With Companies House API configured, you'll get:

**Instead of**: "John Smith (Generated)"
**You'll get**: "Sarah Johnson (Real Director from Companies House)"

**Instead of**: "john.smith@company.co.uk (Generated)"
**You'll get**: "sarah.johnson@realcompany.co.uk (Based on real name)"

**Instead of**: "85% confidence (Simulated)"
**You'll get**: "90% confidence (Official Companies House data)"

## 🚨 Important Notes

1. **Companies House API is FREE** - No cost, just requires registration
2. **Rate Limits**: Companies House allows 600 requests/hour
3. **Data Quality**: Official government data is highly accurate
4. **UK Only**: Companies House only covers UK companies
5. **Privacy**: Only public company information is available

## 🔄 Fallback System

If APIs fail or aren't configured:
- System falls back to enhanced sample data
- Still provides realistic contacts
- Maintains functionality for testing

## 📞 Support

Need help setting up APIs? The system will work with just the Companies House API key, which takes about 5 minutes to set up and is completely free!
