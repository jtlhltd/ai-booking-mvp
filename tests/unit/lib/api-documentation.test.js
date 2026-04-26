import { describe, expect, test } from '@jest/globals';
import { generateApiDocs } from '../../../lib/api-documentation.js';

describe('api-documentation', () => {
  test('generateApiDocs returns OpenAPI-shaped document with core paths', () => {
    const doc = generateApiDocs();
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toMatch(/AI Booking/);
    expect(doc.paths['/health']).toBeTruthy();
    expect(doc.paths['/api/calendar/check-book']).toBeTruthy();
    expect(doc.components.securitySchemes.ApiKeyAuth.name).toBe('X-API-Key');
  });
});
