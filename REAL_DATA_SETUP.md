# 🔑 Real Data Setup Guide

## Overview
The UK Business Search system is now configured to use real APIs, but falls back to sample data if API keys aren't configured.

## 🚀 Quick Setup (5 minutes)

### 1. Google Places API (Most Important)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable "Places API" and "Places API (New)"
4. Create credentials → API Key
5. Copy the API key

### 2. Companies House API (Free)
1. Go to [Companies House Developer Hub](https://developer.company-information.service.gov.uk/)
2. Register for free account
3. Get your API key (600 requests/day free)

### 3. Add to Render Environment Variables
1. Go to your Render dashboard
2. Select your service
3. Go to Environment tab
4. Add these variables:

```
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
COMPANIES_HOUSE_API_KEY=your_companies_house_api_key_here
```

## 🔍 How to Test

1. **Without API Keys**: System uses sample data (current state)
2. **With API Keys**: System searches real UK businesses

## 📊 What You'll Get

### Real Business Data:
- ✅ Actual business names and addresses
- ✅ Real phone numbers and emails
- ✅ Current business information
- ✅ Accurate ratings and reviews
- ✅ Up-to-date contact details

### Decision Maker Research:
- ✅ LinkedIn profile searches
- ✅ Website contact scraping
- ✅ Companies House officer data
- ✅ Email pattern matching
- ✅ Confidence scoring

## 💰 Cost Estimate

- **Google Places API**: ~$0.017 per search (very cheap)
- **Companies House API**: Free (600 requests/day)
- **Yell.com API**: Optional (paid service)

## 🎯 Next Steps

1. Get Google Places API key (most important)
2. Add to Render environment variables
3. Test with real searches
4. Get Companies House API key for enhanced data
5. Consider Yell.com for additional contact details

## 🔧 Current Status

- ✅ Real API integration enabled
- ✅ Fallback to sample data working
- ⏳ Waiting for API keys to be configured
- ✅ System ready for real data

Once you add the API keys, the system will automatically start using real data instead of sample data!
