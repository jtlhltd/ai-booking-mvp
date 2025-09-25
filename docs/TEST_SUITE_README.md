# AI Booking MVP - Test Suite

Complete testing suite for your AI booking system. Run these tests to verify every aspect of your system is working correctly.

## 🚀 Quick Start

### Run All Tests
```powershell
.\run-all-tests.ps1
```

### Run Individual Tests
```powershell
# Quick essential checks
.\test-quick-smoke.ps1

# Complete system test
.\test-complete-system.ps1

# SMS scenarios
.\test-sms-scenarios.ps1

# Client onboarding
.\test-client-onboarding.ps1

# Performance testing
.\test-performance-load.ps1
```

## 📋 Test Suites Overview

### 1. Quick Smoke Test (`test-quick-smoke.ps1`)
**Purpose**: Fastest way to verify your system is working
**Duration**: ~30 seconds
**Tests**:
- System health check
- Metrics dashboard
- Main dashboard
- SMS webhook
- Onboarding wizard

### 2. Complete System Test (`test-complete-system.ps1`)
**Purpose**: Comprehensive functionality testing
**Duration**: ~5 minutes
**Tests**:
- System health & metrics
- Tenant management
- Lead scoring
- SMS simulation (4 scenarios)
- Dashboard access
- Client creation
- Error handling
- Performance checks
- Business hours
- Integration tests

### 3. SMS Scenarios (`test-sms-scenarios.ps1`)
**Purpose**: Test SMS interactions and flows
**Duration**: ~3 minutes
**Tests**:
- New customer opt-in flow
- Existing customer booking
- Customer support interactions
- Opt-out flow
- Edge cases (empty messages, special characters)
- Multiple customers
- Business hours testing

### 4. Client Onboarding (`test-client-onboarding.ps1`)
**Purpose**: Test client creation and management
**Duration**: ~4 minutes
**Tests**:
- Healthcare clinic creation
- Legal firm creation
- Beauty salon creation
- Fitness trainer creation
- Consulting firm creation
- Error handling
- Dashboard functionality
- Client verification

### 5. Performance & Load (`test-performance-load.ps1`)
**Purpose**: Test system performance under load
**Duration**: ~8 minutes
**Tests**:
- Single request performance
- Concurrent requests (10 simultaneous)
- SMS load testing (20 messages)
- Client creation performance (5 clients)
- Memory and resource usage
- Response time analysis

### 6. Manual Testing Checklist (`test-manual-checklist.ps1`)
**Purpose**: Step-by-step manual testing guide
**Duration**: ~30 minutes
**Tests**:
- Basic system access
- Admin functionality
- SMS functionality
- Client onboarding
- Dashboard functionality
- Error handling
- Business hours testing
- Integration testing
- Performance testing
- Security testing

## 🎯 What Each Test Validates

### ✅ System Health
- Server is running and responsive
- All endpoints are accessible
- Database connections working
- API authentication working

### ✅ SMS Functionality
- Inbound SMS processing
- Tenant resolution
- Lead creation and updates
- VAPI call triggering
- Business hours detection

### ✅ Client Management
- Client creation via API
- Database storage
- File generation (dashboards, checklists)
- Tenant configuration
- Branding customization

### ✅ Dashboard Functionality
- Real-time metrics
- Interactive elements
- Multi-tenant views
- Client-specific dashboards
- Onboarding wizards

### ✅ Performance
- Response times
- Concurrent user handling
- Load capacity
- Memory usage
- Error rates

### ✅ Security
- API key authentication
- Input validation
- Rate limiting
- Error handling

## 🔧 Troubleshooting

### Common Issues

**1. Tests Fail with Connection Errors**
- Check if your Render service is running
- Verify the URL is correct: `https://ai-booking-mvp.onrender.com`
- Check Render logs for service status

**2. SMS Tests Fail**
- Verify your Twilio webhook is configured
- Check if your phone number (+447491683261) is correct
- Ensure VAPI API key is set

**3. Client Creation Tests Fail**
- Check database connectivity
- Verify API key is correct
- Check file system permissions

**4. Performance Tests Show Slow Response**
- Check Render service plan limits
- Monitor resource usage
- Consider upgrading service plan

### Debug Steps

1. **Check Render Logs**
   ```
   Go to: https://dashboard.render.com
   Navigate to your service
   Check "Logs" tab
   ```

2. **Verify Environment Variables**
   ```
   Check: API_KEY, VAPI_PRIVATE_KEY, TWILIO_AUTH_TOKEN
   ```

3. **Test Individual Components**
   ```
   Run: .\test-quick-smoke.ps1
   ```

4. **Check Database**
   ```
   Verify: Database connection and data
   ```

## 📊 Test Results Interpretation

### Success Rates
- **90%+**: Excellent - System working perfectly
- **70-89%**: Good - Minor issues to address
- **50-69%**: Fair - Several issues need fixing
- **<50%**: Poor - Major issues require attention

### Response Times
- **<1 second**: Excellent performance
- **1-3 seconds**: Good performance
- **3-5 seconds**: Acceptable performance
- **>5 seconds**: Needs optimization

### Error Types
- **Connection Errors**: Service down or network issues
- **Authentication Errors**: API key or permissions issues
- **Validation Errors**: Input data problems
- **Timeout Errors**: Performance or resource issues

## 🎉 Success Criteria

Your system is working correctly if:
- ✅ All smoke tests pass
- ✅ SMS webhook responds correctly
- ✅ Client creation works
- ✅ Dashboards load properly
- ✅ Response times are under 3 seconds
- ✅ No critical errors in logs

## 📞 Support

If tests fail:
1. Check Render logs for errors
2. Verify environment variables
3. Test individual components
4. Check service status
5. Review error messages for specific issues

## 🔄 Regular Testing

**Recommended Testing Schedule**:
- **Daily**: Run smoke test
- **Weekly**: Run complete system test
- **Before Deployments**: Run all tests
- **After Changes**: Run relevant test suites

---

**Happy Testing! 🚀**
