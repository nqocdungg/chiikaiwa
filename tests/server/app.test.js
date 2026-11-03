import express from 'express';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { errorHandler } from '../../server/middleware/error-handler.js';

describe('API foundation', () => {
  const app = createApp({ checkHealth: async () => {} });

  it('returns the health envelope without caching or exposing the framework', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body.data).toEqual({ status: 'ok' });
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
    expect(Number.isNaN(Date.parse(response.body.meta.serverTime))).toBe(false);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports unavailable storage without leaking connection details', async () => {
    const broken = createApp({
      checkHealth: async () => {
        throw new Error('mongodb://secret');
      },
    });
    const response = await request(broken).get('/api/v1/health').expect(503);
    expect(response.body.data).toEqual({ status: 'unavailable' });
    expect(response.text).not.toContain('secret');
  });

  it('keeps unknown API paths as JSON 404 responses', async () => {
    const response = await request(app).get('/api/v1/missing').expect(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects malformed and oversized JSON with the documented error codes', async () => {
    const malformed = await request(app)
      .post('/api/v1/missing')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(malformed.body.error.code).toBe('MALFORMED_REQUEST');
    const oversized = await request(app)
      .post('/api/v1/missing')
      .send({ value: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps duplicate email keys to the documented conflict without leaking values', async () => {
    const duplicateEmailApp = express();
    duplicateEmailApp.post('/register', (_request, _response, next) => {
      next({
        code: 11000,
        keyPattern: { emailKey: 1 },
        keyValue: { emailKey: 'private@example.test' },
      });
    });
    duplicateEmailApp.use(errorHandler);

    const response = await request(duplicateEmailApp)
      .post('/register')
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_EXISTS');
    expect(response.text).not.toContain('private@example.test');
    expect(response.text).not.toContain('emailKey');
  });

  it('keeps unrecognized duplicate keys as internal errors', async () => {
    const unknownDuplicateApp = express();
    unknownDuplicateApp.post('/write', (_request, _response, next) => {
      next({ code: 11000, keyPattern: { operationId: 1 } });
    });
    unknownDuplicateApp.use(errorHandler);

    const response = await request(unknownDuplicateApp)
      .post('/write')
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('operationId');
  });
});
