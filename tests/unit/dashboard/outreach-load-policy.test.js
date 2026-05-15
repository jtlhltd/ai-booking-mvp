import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_HTML = path.join(process.cwd(), 'public', 'client-dashboard.html');

describe('outreach dashboard load policy (static guard)', () => {
  test('parallel boot uses brief client-dashboard API with outreach fallback keys', () => {
    const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
    expect(html).toMatch(/SANDBOX_CLIENT_KEY\s*=\s*'sandbox_client'/);
    expect(html).toMatch(/OUTREACH_DASHBOARD_CLIENT_KEYS_FALLBACK\s*=\s*\[[^\]]*d2d-xpress-tom/);
    expect(html).toMatch(/guessOutreachBriefForClient\(currentClient\)/);
    expect(html).toMatch(/\/api\/client-dashboard\//);
    expect(html).toMatch(/fetchLiveData\(currentClient,\s*\{\s*brief:\s*guessBriefBoot\s*\}\)/);
    expect(html).toMatch(/Promise\.all\(\[clientsPromise,\s*livePromise\]\)/);
  });

  test('background poll uses brief + etag and idle backoff', () => {
    const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
    expect(html).toMatch(/useEtag:\s*true/);
    expect(html).toMatch(/If-None-Match/);
    expect(html).toMatch(/notModified/);
    expect(html).toMatch(/outreachBriefListPending\s*&&\s*isOutreachDashboardClient/);
    expect(html).toMatch(/dashboardPollDelayMs/);
    expect(html).toMatch(/DASHBOARD_FULL_HYDRATE_IDLE_MS\s*=\s*30000/);
  });

  test('outreach deferred wave still loads recordings panels', () => {
    const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
    expect(html).toMatch(/runDashboardDeferredWave1/);
    expect(html).toMatch(/renderCallRecordings\(callsToRender\)/);
    expect(html).toMatch(/renderVoicemailListener\(\)/);
    expect(html).toMatch(/renderRetryQueue\(dashboardData\)/);
  });
});
