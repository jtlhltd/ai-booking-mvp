import { test, expect } from '@playwright/test';

test.describe('Client dashboard (demo tenant)', () => {
  test('key metric hints leave static Loading state', async ({ page }) => {
    // Force the static DEMO_DATA path: live `/api/demo-dashboard/demo_client` can be slow or return
    // non-seeded counts when a real `demo_client` row exists in Postgres.
    await page.route(
      (url) => /\/api\/demo-dashboard\/demo_client(?:\/|\?|$)/.test(url.pathname),
      (route) => route.abort('failed')
    );

    const v = Date.now();
    await page.goto(`/client-dashboard.html?client=demo-client&v=${v}`, { waitUntil: 'load' });
    const leadsHint = page.locator('#statusHintLeads');
    await expect(leadsHint).not.toHaveText('Loading...', { timeout: 120_000 });

    // Seeded DEMO_DATA — assert several tiles so we do not pass on "shell loads but KPIs never paint".
    await expect(page.locator('#statusTotalLeads')).not.toHaveText('—', { timeout: 120_000 });
    await expect(page.locator('#statusTotalCalls')).not.toHaveText('—', { timeout: 120_000 });
    await expect(page.locator('#statusConversionRate')).not.toHaveText('—', { timeout: 120_000 });
    await expect(page.locator('#statusTotalLeads')).toHaveText('48', { timeout: 120_000 });
    await expect(page.locator('#statusTotalCalls')).toHaveText('36', { timeout: 120_000 });
    await expect(page.locator('#statusConversionRate')).toHaveText('63%', { timeout: 120_000 });
  });
});
