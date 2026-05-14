import { test, expect } from '@playwright/test';

test.describe('Client dashboard KPI strip (live tenant)', () => {
  test('d2d tenant: KPI hints never stay on Loading; leads tile shows a number', async ({ page }) => {
    await page.goto(`/client-dashboard.html?client=d2d-xpress-tom&v=${Date.now()}`, { waitUntil: 'load' });
    const hints = [
      '#statusHintLeads',
      '#statusHintCalls',
      '#statusHintAnswered',
      '#statusHintNoPickup',
      '#statusHintConversion',
      '#statusHintResponse',
    ];
    for (const sel of hints) {
      await expect(page.locator(sel)).not.toHaveText('Loading...', { timeout: 90_000 });
    }
    // Core KPI strip must be painted (not left as static HTML em dashes — that is the broken boot state).
    // Omit conversion / first-call tiles: outreach tenants can keep those as `—` when cohorts are empty.
    const valueIds = ['#statusTotalLeads', '#statusTotalCalls', '#statusCallsAnswered', '#statusCallsNotAnswered'];
    for (const sel of valueIds) {
      await expect(page.locator(sel)).not.toHaveText('—', { timeout: 90_000 });
    }
    await expect(page.locator('#statusTotalLeads')).toHaveText(/^[0-9,]+$/, { timeout: 90_000 });
  });
});
