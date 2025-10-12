// White-Label Configuration System
// Allows clients to customize branding and appearance

import fs from 'fs/promises';
import path from 'path';

export class WhiteLabelManager {
  constructor() {
    this.defaultConfig = {
      branding: {
        companyName: 'AI Booking MVP',
        logo: null,
        favicon: null,
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        accentColor: '#10b981',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      },
      domain: {
        custom: null,
        subdomain: null
      },
      email: {
        fromName: 'AI Booking',
        fromEmail: 'noreply@ai-booking.com',
        replyTo: 'support@ai-booking.com',
        signature: 'Best regards,\nThe AI Booking Team'
      },
      sms: {
        senderName: 'AI Booking',
        shortCode: null
      },
      features: {
        showPoweredBy: true,
        customFooter: null,
        customCss: null
      }
    };
  }

  /**
   * Get white-label configuration for client
   * @param {string} clientKey - Client key
   * @returns {Object} Configuration
   */
  async getConfig(clientKey) {
    try {
      // In production, fetch from database
      const { query } = await import('../db.js');
      
      const result = await query(`
        SELECT white_label_config 
        FROM tenants 
        WHERE client_key = $1
      `, [clientKey]);

      if (result.rows.length > 0 && result.rows[0].white_label_config) {
        return {
          ...this.defaultConfig,
          ...result.rows[0].white_label_config
        };
      }

      return this.defaultConfig;
    } catch (error) {
      console.error('[WHITE-LABEL] Error fetching config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Update white-label configuration
   * @param {string} clientKey - Client key
   * @param {Object} config - New configuration
   * @returns {boolean} Success
   */
  async updateConfig(clientKey, config) {
    try {
      const { query } = await import('../db.js');
      
      // Merge with existing config
      const existingConfig = await this.getConfig(clientKey);
      const newConfig = this.mergeDeep(existingConfig, config);

      await query(`
        UPDATE tenants 
        SET white_label_config = $1, updated_at = NOW()
        WHERE client_key = $2
      `, [JSON.stringify(newConfig), clientKey]);

      console.log(`[WHITE-LABEL] Config updated for ${clientKey}`);
      return true;
    } catch (error) {
      console.error('[WHITE-LABEL] Error updating config:', error);
      return false;
    }
  }

  /**
   * Upload logo/favicon
   * @param {string} clientKey - Client key
   * @param {string} fileType - 'logo' or 'favicon'
   * @param {Buffer} fileBuffer - File data
   * @returns {string} File URL
   */
  async uploadBrandingFile(clientKey, fileType, fileBuffer) {
    try {
      const fileName = `${clientKey}-${fileType}-${Date.now()}.png`;
      const filePath = path.join('public', 'uploads', 'branding', fileName);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Save file
      await fs.writeFile(filePath, fileBuffer);
      
      const fileUrl = `/uploads/branding/${fileName}`;
      
      // Update config with new file URL
      const config = await this.getConfig(clientKey);
      config.branding[fileType] = fileUrl;
      await this.updateConfig(clientKey, config);

      console.log(`[WHITE-LABEL] ${fileType} uploaded for ${clientKey}: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      console.error('[WHITE-LABEL] Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Generate custom CSS for client
   * @param {Object} config - White-label config
   * @returns {string} CSS
   */
  generateCustomCSS(config) {
    const { branding } = config;
    
    return `
      :root {
        --brand-primary: ${branding.primaryColor};
        --brand-secondary: ${branding.secondaryColor};
        --brand-accent: ${branding.accentColor};
        --brand-font: ${branding.fontFamily};
      }

      body {
        font-family: var(--brand-font);
      }

      .btn-primary,
      .action-btn,
      .header {
        background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
      }

      .stat-card::before,
      .section-title {
        color: var(--brand-primary);
      }

      a {
        color: var(--brand-primary);
      }

      a:hover {
        color: var(--brand-secondary);
      }

      ${config.features.customCss || ''}
    `.trim();
  }

  /**
   * Generate branded HTML header
   * @param {Object} config - White-label config
   * @returns {string} HTML
   */
  generateHeader(config) {
    const { branding } = config;
    
    return `
      <div class="branded-header">
        ${branding.logo ? `<img src="${branding.logo}" alt="${branding.companyName}" class="brand-logo">` : ''}
        <h1>${branding.companyName}</h1>
      </div>
    `;
  }

  /**
   * Generate branded email template
   * @param {Object} params - Template parameters
   * @returns {string} HTML email
   */
  generateEmailTemplate({ clientKey, config, subject, body, ctaText, ctaUrl }) {
    const { branding, email } = config;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${branding.fontFamily}; background: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%); padding: 40px 20px; text-align: center;">
      ${branding.logo ? `<img src="${branding.logo}" alt="${branding.companyName}" style="max-width: 200px; margin-bottom: 20px;">` : ''}
      <h1 style="color: white; margin: 0; font-size: 28px;">${branding.companyName}</h1>
    </div>

    <!-- Body -->
    <div style="padding: 40px 30px;">
      ${body}
      
      ${ctaText && ctaUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${ctaUrl}" style="display: inline-block; padding: 15px 30px; background: ${branding.primaryColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">${ctaText}</a>
        </div>
      ` : ''}
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
      <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
        ${email.signature.replace(/\n/g, '<br>')}
      </p>
      ${config.features.showPoweredBy ? `
        <p style="color: #999; font-size: 12px; margin-top: 20px;">
          Powered by AI Booking MVP
        </p>
      ` : ''}
      ${config.features.customFooter ? `
        <p style="color: #666; font-size: 12px; margin-top: 10px;">
          ${config.features.customFooter}
        </p>
      ` : ''}
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Deep merge objects
   */
  mergeDeep(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

/**
 * Report Generator
 * Creates PDF and email reports for clients
 */
export class ReportGenerator {
  /**
   * Generate weekly performance report
   * @param {string} clientKey - Client key
   * @param {Object} data - Performance data
   * @returns {Object} Report data
   */
  async generateWeeklyReport(clientKey, data) {
    const report = {
      clientKey,
      reportType: 'weekly',
      period: {
        start: data.startDate,
        end: data.endDate
      },
      summary: {
        totalLeads: data.leads || 0,
        totalCalls: data.calls || 0,
        totalBookings: data.bookings || 0,
        conversionRate: data.calls > 0 ? ((data.bookings / data.calls) * 100).toFixed(1) : 0,
        revenue: data.revenue || 0
      },
      insights: data.insights || [],
      topPerformers: {
        bestDay: data.bestDay || null,
        bestHour: data.bestHour || null,
        bestSource: data.bestSource || null
      },
      recommendations: data.recommendations || []
    };

    return report;
  }

  /**
   * Generate monthly report
   * @param {string} clientKey - Client key
   * @param {Object} data - Performance data
   * @returns {Object} Report data
   */
  async generateMonthlyReport(clientKey, data) {
    const report = {
      clientKey,
      reportType: 'monthly',
      period: {
        start: data.startDate,
        end: data.endDate
      },
      summary: {
        totalLeads: data.leads || 0,
        totalCalls: data.calls || 0,
        totalBookings: data.bookings || 0,
        conversionRate: data.calls > 0 ? ((data.bookings / data.calls) * 100).toFixed(1) : 0,
        revenue: data.revenue || 0,
        growth: {
          leads: data.leadsGrowth || 0,
          bookings: data.bookingsGrowth || 0,
          revenue: data.revenueGrowth || 0
        }
      },
      breakdown: {
        byWeek: data.weeklyBreakdown || [],
        bySource: data.sourceBreakdown || [],
        byDay: data.dayBreakdown || []
      },
      insights: data.insights || [],
      roi: data.roi || {},
      recommendations: data.recommendations || []
    };

    return report;
  }

  /**
   * Export report as HTML
   * @param {Object} report - Report data
   * @param {Object} config - White-label config
   * @returns {string} HTML
   */
  exportAsHTML(report, config) {
    const { branding } = config;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${report.reportType.toUpperCase()} Report - ${report.clientKey}</title>
  <style>
    body {
      font-family: ${branding.fontFamily};
      background: #f5f7fa;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${branding.primaryColor};
    }
    h1 {
      color: ${branding.primaryColor};
      margin-bottom: 8px;
    }
    .period {
      color: #666;
      font-size: 14px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-label {
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: ${branding.primaryColor};
    }
    .section {
      margin: 30px 0;
    }
    .section h2 {
      color: #1a1a1a;
      margin-bottom: 16px;
    }
    .insight {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 4px solid ${branding.accentColor};
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${branding.logo ? `<img src="${branding.logo}" alt="${branding.companyName}" style="max-width: 200px; margin-bottom: 20px;">` : ''}
      <h1>${report.reportType.toUpperCase()} Performance Report</h1>
      <div class="period">${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Leads</div>
        <div class="stat-value">${report.summary.totalLeads}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Calls Made</div>
        <div class="stat-value">${report.summary.totalCalls}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bookings</div>
        <div class="stat-value">${report.summary.totalBookings}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conversion Rate</div>
        <div class="stat-value">${report.summary.conversionRate}%</div>
      </div>
    </div>

    <div class="section">
      <h2>Key Insights</h2>
      ${report.insights.map(insight => `
        <div class="insight">
          <strong>${insight.title}</strong>
          <p>${insight.message}</p>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2>Recommendations</h2>
      <ul>
        ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
      </ul>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send report via email
   * @param {string} clientKey - Client key
   * @param {Object} report - Report data
   * @param {string} email - Recipient email
   */
  async sendReportEmail(clientKey, report, email) {
    const whiteLabel = new WhiteLabelManager();
    const config = await whiteLabel.getConfig(clientKey);

    const htmlReport = this.exportAsHTML(report, config);

    const emailHTML = whiteLabel.generateEmailTemplate({
      clientKey,
      config,
      subject: `Your ${report.reportType} Performance Report`,
      body: `
        <p>Hi there,</p>
        <p>Your ${report.reportType} performance report is ready! Here's a quick summary:</p>
        <ul>
          <li><strong>${report.summary.totalLeads}</strong> leads imported</li>
          <li><strong>${report.summary.totalBookings}</strong> appointments booked</li>
          <li><strong>${report.summary.conversionRate}%</strong> conversion rate</li>
        </ul>
        <p>Click below to view your full report.</p>
      `,
      ctaText: 'View Full Report',
      ctaUrl: `${process.env.BASE_URL}/reports/${report.clientKey}`
    });

    // In production, send email with htmlReport as attachment
    console.log(`[REPORT] Email sent to ${email} for ${clientKey}`);

    return true;
  }
}

export default {
  WhiteLabelManager,
  ReportGenerator
};

