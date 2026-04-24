// Shared helpers for Google Places search (server + route handlers)

// Helper function to detect mobile numbers
export function isMobileNumber(phone) {
  if (!phone || phone === 'No phone listed') return false;

  // Enhanced UK mobile detection - more patterns to catch mobile numbers
  const mobilePatterns = [
    // Standard UK mobile patterns (7x xxxxxxxx)
    /^\+447[0-9]{9}$/, // +447xxxxxxxxx
    /^07[0-9]{9}$/, // 07xxxxxxxxx
    /^447[0-9]{9}$/, // 447xxxxxxxxx

    // With spaces
    /^\+44\s?7[0-9]{9}$/, // +44 7xxxxxxxxx
    /^0\s?7[0-9]{9}$/, // 0 7xxxxxxxxx
    /^44\s?7[0-9]{9}$/, // 44 7xxxxxxxxx

    // Formatted with spaces (7xx xxx xxx)
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 7xx xxx xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7xx xxx xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 44 7xx xxx xxx

    // With parentheses
    /^\+44\s?\(0\)\s?7[0-9]{9}$/, // +44 (0) 7xxxxxxxxx
    /^0\s?7[0-9]{3}\s?[0-9]{6}$/, // 0 7xx xxxxxx
    /^\+44\s?7[0-9]{3}\s?[0-9]{6}$/, // +44 7xx xxxxxx

    // With dashes
    /^\+44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // +44 7xx-xxx-xxx
    /^0\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 0 7xx-xxx-xxx
    /^44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 44 7xx-xxx-xxx

    // Mixed formatting
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // +44 7xx xxx-xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 0 7xx xxx-xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 44 7xx xxx-xxx

    // With dots
    /^\+44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // +44 7xx.xxx.xxx
    /^0\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 0 7xx.xxx.xxx
    /^44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 44 7xx.xxx.xxx

    // Extended UK mobile prefixes (70, 71, 72, 73, 74, 75, 76, 77, 78, 79)
    /^\+447[0-9][0-9]{8}$/, // +447xxxxxxxxx (all 7x prefixes)
    /^07[0-9][0-9]{8}$/, // 07xxxxxxxxx (all 7x prefixes)
    /^447[0-9][0-9]{8}$/, // 447xxxxxxxxx (all 7x prefixes)

    // Common business formatting variations
    /^\+44\s?\(0\)\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 (0) 7x xxx xxx xxx
    /^0\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7x xxx xxx xxx
    /^44\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 44 7x xxx xxx xxx

    // Additional patterns for better mobile detection
    /^\+44\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // +44 7xx xxx xxxx
    /^0\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // 0 7xx xxx xxxx
    /^44\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // 44 7xx xxx xxxx

    // Patterns with different spacing
    /^\+44\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // +44 7xx xxxx xxx
    /^0\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // 0 7xx xxxx xxx
    /^44\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // 44 7xx xxxx xxx
  ];

  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  let mobile = mobilePatterns.some((pattern) => pattern.test(cleanPhone));

  // UK-specific fallback: Check if it starts with 07 and has 11 digits total (UK mobile pattern)
  if (!mobile && cleanPhone.length === 11 && cleanPhone.startsWith('07')) {
    mobile = true;
  }

  // UK-specific fallback: Check for +44 7 pattern (UK mobile with country code)
  if (!mobile && cleanPhone.length >= 12 && cleanPhone.startsWith('447')) {
    mobile = true;
  }

  // STRICT UK mobile detection - only accept true mobile patterns
  if (!mobile && cleanPhone.length >= 10 && cleanPhone.length <= 15) {
    if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
      mobile = true;
    } else if (cleanPhone.startsWith('447') && cleanPhone.length >= 12) {
      mobile = true;
    }
  }

  // REJECT landline numbers that might contain mobile-like patterns
  if (mobile) {
    if (cleanPhone.startsWith('01') || cleanPhone.startsWith('02') || cleanPhone.startsWith('03')) {
      mobile = false;
    } else if (cleanPhone.startsWith('08')) {
      mobile = false;
    } else if (cleanPhone.startsWith('09')) {
      mobile = false;
    }
  }

  return mobile;
}

// Helper function to generate email
export function generateEmail(businessName) {
  const cleanName = String(businessName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const domains = ['gmail.com', 'outlook.com', 'yahoo.co.uk', 'hotmail.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `contact@${cleanName}.${domain}`;
}

