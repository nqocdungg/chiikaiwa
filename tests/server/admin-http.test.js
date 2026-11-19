import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../server/app.js';
import * as identityService from '../../server/modules/identity/identity-service.js';

const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

/**
 * Helper to fetch a CSRF token and cookie from the app.
 * @param {import('express').Express} app
 */
async function fetchCsrf(app) {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  const csrfToken = res.body.data.csrfToken;
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : String(setCookie ?? '').split(';')[0];
  return { csrfToken, cookieHeader };
}

describe('Admin HTTP Guard and Foundation Unit Tests (BE-026, H-01 - H-08)', () => {
  const app = createApp({ checkHealth: async () => {} });

  const adminEndpoints = [
    { method: 'get', path: '/api/v1/admin/users' },
    {
      method: 'patch',
      path: '/api/v1/admin/users/507f1f77bcf86cd799439011/status',
    },
    { method: 'get', path: '/api/v1/admin/reports' },
    { method: 'get', path: '/api/v1/admin/reports/507f1f77bcf86cd799439011' },
    { method: 'patch', path: '/api/v1/admin/reports/507f1f77bcf86cd799439011' },
  ];

  describe('H-01: Không cookie gọi 5 endpoint -> 401 AUTH_REQUIRED', () => {
    it.each(adminEndpoints)(
      '$method $path trả về 401 khi không có cookie xác thực',
      async ({ method, path }) => {
        const { csrfToken, cookieHeader } = await fetchCsrf(app);
        const req =
          method === 'patch'
            ? request(app).patch(path)
            : request(app).get(path);
        if (method === 'patch') {
          req
            .set('Origin', DEFAULT_ORIGIN)
            .set('Cookie', cookieHeader)
            .set('X-CSRF-Token', csrfToken)
            .send({});
        }
        const res = await req.expect(401);
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toHaveProperty('meta');
      },
    );
  });

  describe('H-02: Người học (learner) gọi 5 endpoint -> 403 FORBIDDEN', () => {
    it.each(adminEndpoints)(
      '$method $path trả về 403 FORBIDDEN khi người dùng chỉ là learner',
      async ({ method, path }) => {
        vi.spyOn(
          identityService,
          'resolveIdentityFromCookies',
        ).mockResolvedValueOnce(
          /** @type {any} */ ({
            kind: 'user',
            userId: new ObjectId('507f1f77bcf86cd799439011'),
            actorKey: 'user:507f1f77bcf86cd799439011',
            role: 'learner',
            status: 'active',
            sessionId: new ObjectId('607f1f77bcf86cd799439011'),
            authVersion: 0,
          }),
        );

        const { csrfToken, cookieHeader } = await fetchCsrf(app);
        const req = (
          method === 'patch' ? request(app).patch(path) : request(app).get(path)
        ).set('Cookie', `${cookieHeader}; ck_session=test-token`);

        if (method === 'patch') {
          req
            .set('Origin', DEFAULT_ORIGIN)
            .set('X-CSRF-Token', csrfToken)
            .set('Idempotency-Key', '4f63d5d0-d68a-4704-81a3-2833f534e532')
            .send({ expectedVersion: 0, status: 'locked' });
        }

        const res = await req.expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      },
    );
  });

  describe('H-03: Khách (guest) gọi 5 endpoint -> 403 FORBIDDEN', () => {
    it.each(adminEndpoints)(
      '$method $path trả về 403 FORBIDDEN khi người dùng là guest',
      async ({ method, path }) => {
        vi.spyOn(
          identityService,
          'resolveIdentityFromCookies',
        ).mockResolvedValueOnce(
          /** @type {any} */ ({
            kind: 'guest',
            guestId: new ObjectId('707f1f77bcf86cd799439011'),
            actorKey: 'guest:707f1f77bcf86cd799439011',
            role: 'guest',
            status: 'active',
            guestSession: {},
          }),
        );

        const { csrfToken, cookieHeader } = await fetchCsrf(app);
        const req = (
          method === 'patch' ? request(app).patch(path) : request(app).get(path)
        ).set('Cookie', `${cookieHeader}; ck_guest=test-token`);

        if (method === 'patch') {
          req
            .set('Origin', DEFAULT_ORIGIN)
            .set('X-CSRF-Token', csrfToken)
            .set('Idempotency-Key', '4f63d5d0-d68a-4704-81a3-2833f534e532')
            .send({ expectedVersion: 0, status: 'locked' });
        }

        const res = await req.expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      },
    );
  });

  describe('H-04: CSRF & Origin enforcement trên các endpoint PATCH', () => {
    it('từ chối 403 CSRF_INVALID khi thiếu Origin hoặc Origin không nằm trong allowlist', async () => {
      const { csrfToken, cookieHeader } = await fetchCsrf(app);

      // Thiếu Origin
      const resMissing = await request(app)
        .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/status')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);
      expect(resMissing.body.error.code).toBe('CSRF_INVALID');

      // Origin lạ
      const resBadOrigin = await request(app)
        .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/status')
        .set('Origin', 'https://attacker.example.com')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);
      expect(resBadOrigin.body.error.code).toBe('CSRF_INVALID');
    });

    it('từ chối 403 CSRF_INVALID khi thiếu X-CSRF-Token trên PATCH', async () => {
      const { cookieHeader } = await fetchCsrf(app);

      const res = await request(app)
        .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/status')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', cookieHeader)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('GET /admin/users và GET /admin/reports không bắt buộc CSRF token', async () => {
      // Khi không có CSRF token, GET endpoint vẫn vào được guard requireAuth (trả 401 do thiếu session, chứ không phải 403 CSRF_INVALID)
      const res1 = await request(app).get('/api/v1/admin/users').expect(401);
      expect(res1.body.error.code).toBe('AUTH_REQUIRED');

      const res2 = await request(app).get('/api/v1/admin/reports').expect(401);
      expect(res2.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('H-05: 415 UNSUPPORTED_MEDIA_TYPE trên body không phải JSON', () => {
    it('từ chối 415 khi gửi Content-Type không phải application/json trên PATCH', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/status')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('plain text body')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });

  describe('H-06: 413 PAYLOAD_TOO_LARGE', () => {
    it('từ chối 413 khi payload vượt quá 1 MiB', async () => {
      const hugeString = 'x'.repeat(1024 * 1024 + 10);
      const res = await request(app)
        .patch('/api/v1/admin/users/507f1f77bcf86cd799439011/status')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            expectedVersion: 0,
            status: 'locked',
            padding: hugeString,
          }),
        )
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('H-07 & H-08: Envelope, Cache-Control và không lộ thông tin nhạy cảm', () => {
    it('mọi response đều chứa Cache-Control: no-store và envelope chuẩn {data|error, meta}', async () => {
      const res = await request(app).get('/api/v1/admin/users').expect(401);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('requestId');
      expect(res.body.meta).toHaveProperty('serverTime');

      // Không lộ thông tin nhạy cảm (stack trace, uri)
      expect(res.text).not.toContain('mongodb://');
      expect(res.text).not.toContain('node_modules');
    });
  });
});
