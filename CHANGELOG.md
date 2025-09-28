# Lead Generator Changelog

## Version 1.0.0 - Working Base (Current)
**Status**: ✅ WORKING - Finds mobile numbers reliably

### What Works:
- Single search mode only
- Frontend sends `maxResults * 2` to backend
- Backend processes `maxResults * 1.5` results
- Backend stops at `maxResults * 2` limit
- Mobile number detection works
- No 502 errors
- Finds exactly the requested number of mobile leads

### Key Settings:
- Frontend multiplier: `maxResults * 2`
- Backend processing: `maxResults * 1.5`
- Backend limit: `maxResults * 2`
- API timeout: 30 seconds
- Delay between calls: 100ms

---

## [2024-12-19] - Improved Mobile Number Detection
**Status**: 🔄 TESTING

**What Changed**:
- Enhanced mobile number detection patterns to catch more UK mobile formats
- Added support for dashes, dots, and mixed formatting
- Extended UK mobile prefixes (70-79 instead of just 70-79)
- Improved phone number cleaning to handle more formatting characters

**How It Was Done**:
- Added 15+ new regex patterns for different UK mobile formats
- Updated phone cleaning regex to include dots: `[\s\-\(\)\.]`
- Added patterns for: dashes, dots, mixed formatting, extended prefixes
- Maintained backward compatibility with existing patterns

**Result**:
- Should detect more mobile numbers that were previously missed
- Better handling of business-formatted phone numbers
- More accurate mobile vs landline classification

**Files Modified**:
- `server.js` - Enhanced `isMobileNumber()` function

**Git Commit**:
- TBD (will commit after testing)

---

## Change Log Template

### [DATE] - [CHANGE DESCRIPTION]
**Status**: ✅ WORKING / ❌ BROKEN / 🔄 TESTING

**What Changed**:
- 

**How It Was Done**:
- 

**Result**:
- 

**Files Modified**:
- 

**Git Commit**:
- 

---

## Notes
- Always test after each change
- If broken, revert immediately
- Document exact working state
- One change at a time only