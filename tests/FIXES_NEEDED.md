# Test Failures - Fixes Needed

## Summary
7 test files have failures that need to be addressed:

### 1. Phone Validation (`tests/unit/test-phone-validation.js`)
**Issue:** UK landline normalization fails
- **Problem:** `02071234567` normalizes to `+02071234567` instead of `+442071234567`
- **Fix needed:** Update `normalizePhoneE164()` in `lib/utils.js` to handle UK landline numbers (starting with 0)
- **Location:** `lib/utils.js` line 5-50
- **Fix:** Add logic to convert UK landline numbers (0XX...) to +44 format

### 2. Error Factory (`tests/lib/test-errors.js`)
**Issue:** Missing `ErrorFactory.validation()` method
- **Problem:** Test expects `ErrorFactory.validation()` but method doesn't exist
- **Fix needed:** Add `ErrorFactory.validation()` static method to `lib/errors.js`
- **Location:** `lib/errors.js` line 128-150
- **Fix:** Add method:
```javascript
static validation(message, field = null, value = null) {
  return new ValidationError(message, field, value);
}
```

### 3. ExternalServiceError Constructor (`tests/lib/test-errors.js`)
**Issue:** Constructor parameter order mismatch
- **Problem:** Test calls `new ExternalServiceError('Service unavailable', 'vapi')` but constructor expects `(service, message)`
- **Fix needed:** Either update test or make constructor handle both orders
- **Location:** `lib/errors.js` line 83-90
- **Fix:** Update test to match constructor: `new ExternalServiceError('vapi', 'Service unavailable')`

### 4. SQL Injection Sanitization (`tests/security/test-input-validation.js`)
**Issue:** `sanitizeString()` doesn't handle SQL injection patterns
- **Problem:** Function only handles XSS, not SQL injection
- **Fix needed:** Enhance `sanitizeString()` in `lib/utils.js` to detect SQL patterns
- **Location:** `lib/utils.js` line 83-89
- **Fix:** Add SQL injection pattern detection:
```javascript
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi, '')
    .replace(/['";]/g, '')
    .trim();
}
```

### 5. Logistics Extraction (`tests/unit/test-logistics-extraction.js`)
**Issues:** Multiple extraction mismatches
- **Problems:**
  - International flag not extracted correctly
  - Frequency extraction patterns don't match
  - Empty/null transcript handling returns undefined instead of empty string
- **Fix needed:** Update `extractLogisticsFields()` in `lib/logistics-extractor.js`
- **Location:** `lib/logistics-extractor.js`
- **Fixes:**
  - Ensure function returns empty strings for missing fields, not undefined
  - Improve frequency regex patterns
  - Fix international Y/N detection

### 6. Call Quality Analysis (`tests/unit/test-call-quality-analysis.js`)
**Issues:** Some objection detection and quality scoring edge cases
- **Problems:**
  - "timing" objection not detected in some phrases
  - "trust" objection not detected in some phrases
  - Quality score calculation edge cases
- **Fix needed:** Update objection extraction and quality scoring in `lib/call-quality-analysis.js`
- **Location:** `lib/call-quality-analysis.js`
- **Fixes:**
  - Enhance objection detection patterns
  - Review quality score calculation logic

### 7. Structured Output Mapping (`tests/unit/test-structured-output-mapping.js`)
**Issue:** Domestic frequency not extracted from transcript fallback
- **Problem:** When structured output is partial, transcript fallback doesn't extract domestic frequency
- **Fix needed:** Update mapping logic in test or extraction function
- **Location:** Test file or extraction logic
- **Fix:** Ensure transcript fallback properly extracts all fields

### 8. Environment Validator (`tests/unit/test-env-validator.js`)
**Issue:** Test expects validation to pass but it throws error
- **Problem:** Test doesn't handle the fact that validation throws when env vars are missing
- **Fix needed:** Update test to expect error or wrap in try-catch
- **Location:** `tests/unit/test-env-validator.js`
- **Fix:** Test should expect error or use `assertThrows()`

## Priority Fixes

### High Priority (Core Functionality)
1. Phone normalization for UK landlines
2. SQL injection sanitization
3. Error factory validation method

### Medium Priority (Test Accuracy)
4. ExternalServiceError constructor/test alignment
5. Logistics extraction edge cases
6. Environment validator test

### Low Priority (Edge Cases)
7. Call quality analysis objection detection
8. Structured output mapping fallback

## Quick Fixes

### Fix 1: Phone Normalization
```javascript
// In lib/utils.js, normalizePhoneE164 function
// Add after line 40:
// UK landline: 0XX... -> +44XX...
const m3 = digits.match(/^0([1-9]\d{8,9})$/);
if (m3) {
  const cand = '+44' + m3[1];
  if (isE164(cand)) return cand;
}
```

### Fix 2: Error Factory
```javascript
// In lib/errors.js, add to ErrorFactory class:
static validation(message, field = null, value = null) {
  return new ValidationError(message, field, value);
}
```

### Fix 3: SQL Sanitization
```javascript
// In lib/utils.js, update sanitizeString:
.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi, '')
.replace(/['";]/g, '')
```

