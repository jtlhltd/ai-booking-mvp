// lib/whitelabel.js
// White-label branding configuration for clients

/**
 * Get client branding settings
 * @param {Object} client - Client object
 * @returns {Object} - Branding configuration
 */
export function getClientBranding(client) {
  // Default branding
  const defaultBranding = {
    colors: {
      primary: '#667eea',
      secondary: '#764ba2',
      background: '#ffffff',
      text: '#333333',
      accent: '#10b981'
    },
    logo: {
      url: null,
      alt: client.displayName || 'Logo'
    },
    companyName: client.displayName || 'AI Booking',
    contact: {
      email: client.contact?.email || null,
      phone: client.contact?.phone || null,
      address: client.address || null
    },
    social: {
      website: client.website || null,
      linkedin: null,
      twitter: null,
      facebook: null
    },
    custom: {
      favicon: null,
      emailSignature: null,
      smsSignature: null
    }
  };
  
  // Merge with client's custom branding if exists
  return {
    ...defaultBranding,
    ...(client.branding || {}),
    colors: {
      ...defaultBranding.colors,
      ...(client.branding?.colors || {})
    }
  };
}

/**
 * Apply branding to email template
 * @param {string} html - HTML content
 * @param {Object} branding - Branding configuration
 * @returns {string} - Branded HTML
 */
export function applyEmailBranding(html, branding) {
  const colors = branding.colors;
  
  return html
    .replace(/#667eea/g, colors.primary)
    .replace(/#764ba2/g, colors.secondary)
    .replace(/AI Booking/g, branding.companyName)
    .replace(/background: #ffffff/g, `background: ${colors.background}`)
    .replace(/color: #333333/g, `color: ${colors.text}`);
}

/**
 * Apply branding to SMS template
 * @param {string} message - SMS message
 * @param {Object} branding - Branding configuration
 * @returns {string} - Branded message
 */
export function applySMSBranding(message, branding) {
  let branded = message;
  
  // Add company name if not present
  if (!branded.includes(branding.companyName)) {
    branded = `${branded}\n\n${branding.companyName}`;
  }
  
  // Add custom signature if configured
  if (branding.custom.smsSignature) {
    branded = `${branded}\n${branding.custom.smsSignature}`;
  }
  
  return branded;
}

/**
 * Generate client-specific dashboard HTML
 * @param {string} htmlTemplate - Base HTML template
 * @param {Object} branding - Branding configuration
 * @returns {string} - Branded HTML
 */
export function applyDashboardBranding(htmlTemplate, branding) {
  const colors = branding.colors;
  
  // Replace CSS variables and inline styles
  let branded = htmlTemplate
    .replace(/var\(--primary-color\)/g, colors.primary)
    .replace(/var\(--secondary-color\)/g, colors.secondary)
    .replace(/var\(--accent-color\)/g, colors.accent)
    .replace(/#667eea/g, colors.primary)
    .replace(/#764ba2/g, colors.secondary)
    .replace(/#10b981/g, colors.accent)
    .replace(/AI Booking MVP/g, branding.companyName);
  
  // Add logo if configured
  if (branding.logo.url) {
    branded = branded.replace(
      /<div[^>]*class="[^"]*logo[^"]*"[^>]*>.*?<\/div>/g,
      `<div class="logo"><img src="${branding.logo.url}" alt="${branding.logo.alt}" style="max-height: 50px;" /></div>`
    );
  }
  
  // Add favicon
  if (branding.custom.favicon) {
    branded = branded.replace(
      /<link[^>]*rel="icon"[^>]*>/g,
      `<link rel="icon" type="image/x-icon" href="${branding.custom.favicon}" />`
    );
  }
  
  return branded;
}

/**
 * Validate branding configuration
 * @param {Object} branding - Branding configuration
 * @returns {Object} - Validation result
 */
export function validateBranding(branding) {
  const errors = [];
  const warnings = [];
  
  // Validate colors (must be valid hex colors)
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  
  if (branding.colors) {
    Object.entries(branding.colors).forEach(([key, value]) => {
      if (value && !hexRegex.test(value)) {
        errors.push(`Invalid color format for ${key}: ${value}`);
      }
    });
  }
  
  // Validate logo URL if provided
  if (branding.logo?.url) {
    try {
      new URL(branding.logo.url);
    } catch (e) {
      errors.push('Invalid logo URL');
    }
  }
  
  // Validate company name
  if (!branding.companyName || branding.companyName.trim().length === 0) {
    errors.push('Company name is required');
  }
  
  // Validate website URL if provided
  if (branding.social?.website) {
    try {
      new URL(branding.social.website);
    } catch (e) {
      warnings.push('Website URL may be invalid');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate branded booking URL
 * @param {string} clientKey - Client key
 * @param {Object} branding - Branding configuration
 * @returns {string} - Branded URL
 */
export function getBrandedBookingUrl(clientKey, branding) {
  const baseUrl = process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
  const slug = branding.custom?.bookingSlug || clientKey;
  
  return `${baseUrl}/book/${slug}`;
}

export default {
  getClientBranding,
  applyEmailBranding,
  applySMSBranding,
  applyDashboardBranding,
  validateBranding,
  getBrandedBookingUrl
};
