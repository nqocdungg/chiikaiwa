import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';

const endpoint = '/api/v1/webhooks/livekit';

afterEach(() => vi.unstubAllEnvs());

describe('LiveKit webhook transport', () => {
  it('keeps HTTPS cookies and browser Origin protection enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', 'https://chiikaiwa.example.test');
    vi.stubEnv(
      'JWT_SECRET',
      'https-smoke-test-secret-with-at-least-32-characters',
    );
    const app = createApp();
    const csrf = await request(app).get('/api/v1/auth/csrf').expect(200);
    const cookies = csrf.headers['set-cookie'];
    const cookie = Array.isArray(cookies)
      ? cookies.join('; ')
      : String(cookies);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
      expect(cookie).toContain(attribute);
    }
    expect(cookie).not.toContain('Domain=');
    expect(csrf.body.data.csrfToken).toMatch(/^[0-9a-f]{64}$/u);
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({})
      .expect(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
  it('rejects compressed bodies instead of changing bytes before verification', async () => {
    const response = await request(createApp())
      .post(endpoint)
      .set('Content-Type', 'application/webhook+json')
      .set('Content-Encoding', 'gzip')
      .send(gzipSync('{}'))
      .expect(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
  it('preserves signed bytes and Authorization without browser cookies or CSRF', async () => {
    const body = '{ "event": "room_started", "name": "日本語", "n": 1.0 }\n';
    const expectedHash = createHash('sha256').update(body).digest('hex');
    const app = createApp({
      handleLivekitWebhook(req, res) {
        expect(Buffer.isBuffer(req.body)).toBe(true);
        expect(createHash('sha256').update(req.body).digest('hex')).toBe(
          expectedHash,
        );
        expect(req.get('Authorization')).toBe('Bearer transport-test');
        res.sendStatus(204);
      },
    });
    await request(app)
      .post(endpoint)
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', 'Bearer transport-test')
      .send(body)
      .expect(204);
  });

  it('does not acknowledge events when LiveKit configuration is unavailable', async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', '');
    const response = await request(createApp())
      .post(endpoint)
      .set('Content-Type', 'application/webhook+json')
      .send('{"event":"room_started"}')
      .expect(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.each(['application/json', 'text/plain'])(
    'rejects unsupported content type %s',
    async (type) => {
      const response = await request(createApp())
        .post(endpoint)
        .set('Content-Type', type)
        .send('{}')
        .expect(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    },
  );

  it('limits raw payload size before calling the handler', async () => {
    let called = false;
    const app = createApp({
      handleLivekitWebhook(_req, res) {
        called = true;
        res.sendStatus(204);
      },
    });
    const response = await request(app)
      .post(endpoint)
      .set('Content-Type', 'application/webhook+json')
      .send('x'.repeat(1024 * 1024 + 1))
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(called).toBe(false);
  });

  it('propagates async handler failures without exposing payloads or credentials', async () => {
    const app = createApp({
      async handleLivekitWebhook() {
        throw new Error('private-credential');
      },
    });
    const response = await request(app)
      .post(endpoint)
      .set('Content-Type', 'application/webhook+json')
      .send('{}')
      .expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('private-credential');
  });
});
