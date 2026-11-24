import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  getClientIp,
  hashRateLimitSubject,
  normalizeRateLimitIp,
} from '../../server/middleware/rate-limit.js';
import {
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from '../../server/modules/identity/crypto.js';
import { toPartnerDto, toSelfDto } from '../../server/modules/identity/dto.js';
import {
  validateLoginInput,
  validateRegisterInput,
} from '../../server/modules/identity/validation.js';

const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

/**
 * Helper to fetch a CSRF token and its Set-Cookie header from the app.
 * @param {import('express').Express} app
 */
async function fetchCsrf(app) {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  const csrfToken = res.body.data.csrfToken;
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : String(setCookie ?? '').split(';')[0];
  return { csrfToken, cookieHeader, rawSetCookie: setCookie };
}

describe('BE-001 Authentication unit & HTTP contract checks', () => {
  const app = createApp({ checkHealth: async () => {} });

  describe('GET /api/v1/auth/csrf & CSRF/Origin enforcement', () => {
    it('issues a 64-char hex CSRF token and sets an HttpOnly SameSite=Lax cookie without Domain', async () => {
      const { csrfToken, rawSetCookie } = await fetchCsrf(app);
      expect(csrfToken).toMatch(/^[0-9a-f]{64}$/u);
      const cookieStr = Array.isArray(rawSetCookie)
        ? rawSetCookie.join('; ')
        : String(rawSetCookie);
      expect(cookieStr).toContain('ck_csrf=');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Lax');
      expect(cookieStr).toContain('Path=/');
      expect(cookieStr).not.toContain('Domain=');
    });

    it.each([
      [DEFAULT_ORIGIN, 'http://localhost:5173'],
      ['http://localhost:5173', DEFAULT_ORIGIN],
    ])(
      'accepts the local development alias of %s',
      async (configured, alias) => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('APP_ORIGIN', configured);
        try {
          const { csrfToken, cookieHeader } = await fetchCsrf(app);
          /** @param {string} origin */
          const sendRequest = (origin, token = csrfToken) =>
            request(app)
              .post('/api/v1/auth/password-change')
              .set('Origin', origin)
              .set('Cookie', cookieHeader)
              .set('X-CSRF-Token', token)
              .send({});

          await sendRequest(alias).expect(401);
          await sendRequest('http://localhost:5174').expect(403);
          await sendRequest(alias, '0'.repeat(64)).expect(403);

          vi.stubEnv('NODE_ENV', 'test');
          await sendRequest(alias).expect(403);
        } finally {
          vi.unstubAllEnvs();
        }
      },
    );

    it('rejects mutating requests when Origin header is missing or not in allowlist', async () => {
      const { csrfToken, cookieHeader } = await fetchCsrf(app);

      const missingOrigin = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(403);
      expect(missingOrigin.body.error.code).toBe('CSRF_INVALID');

      const wrongOrigin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://attacker.example.com')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(403);
      expect(wrongOrigin.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects mutating requests when X-CSRF-Token header or ck_csrf cookie is missing or mismatched', async () => {
      const { csrfToken, cookieHeader } = await fetchCsrf(app);

      const missingHeader = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', cookieHeader)
        .send({
          email: 'user@example.com',
          password: 'password123',
          displayName: 'User',
        })
        .expect(403);
      expect(missingHeader.body.error.code).toBe('CSRF_INVALID');

      const missingCookie = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', DEFAULT_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'user@example.com',
          password: 'password123',
          displayName: 'User',
        })
        .expect(403);
      expect(missingCookie.body.error.code).toBe('CSRF_INVALID');

      const mismatchedToken = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', 'a'.repeat(64))
        .send({
          email: 'user@example.com',
          password: 'password123',
          displayName: 'User',
        })
        .expect(403);
      expect(mismatchedToken.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects non-JSON Content-Type on mutating requests with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const { csrfToken, cookieHeader } = await fetchCsrf(app);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .set('Content-Type', 'text/plain')
        .send('email=user@example.com')
        .expect(415);

      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });

  describe('Input validation & NoSQL injection defense', () => {
    it('normalizes emailKey by trimming and lowercasing while preserving dots and +tags', () => {
      const result = validateRegisterInput({
        email: '  Hanh.Nhi+Sprint1@Example.COM  ',
        password: '  8chars  ',
        displayName: '  Hạnh Nhi  ',
      });
      expect(result.email).toBe('Hanh.Nhi+Sprint1@Example.COM');
      expect(result.emailKey).toBe('hanh.nhi+sprint1@example.com');
      // Password must NOT be trimmed
      expect(result.password).toBe('  8chars  ');
      // displayName must be trimmed
      expect(result.displayName).toBe('Hạnh Nhi');
    });

    it('enforces Unicode code point boundaries (8..128 for password, 1..100 for displayName)', () => {
      // 8 multibyte emoji code points (16 UTF-16 code units, 8 Unicode code points)
      const eightEmoji = '🌸'.repeat(8);
      const valid = validateRegisterInput({
        email: 'emoji@example.com',
        password: eightEmoji,
        displayName: '🌸'.repeat(100),
      });
      expect(valid.password).toBe(eightEmoji);

      expect(() =>
        validateRegisterInput({
          email: 'emoji@example.com',
          password: '🌸'.repeat(7),
          displayName: 'Nhi',
        }),
      ).toThrow();

      expect(() =>
        validateRegisterInput({
          email: 'emoji@example.com',
          password: 'a'.repeat(129),
          displayName: 'Nhi',
        }),
      ).toThrow();

      expect(() =>
        validateRegisterInput({
          email: 'emoji@example.com',
          password: 'validpass123',
          displayName: '   ',
        }),
      ).toThrow();
    });

    it('rejects unknown fields (such as role, status, authVersion) and NoSQL operator objects', () => {
      try {
        validateRegisterInput({
          email: 'hacker@example.com',
          password: 'password123',
          displayName: 'Hacker',
          role: 'admin',
        });
        expect.fail('Should have rejected role field');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.code).toBe('VALIDATION_FAILED');
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'role', code: 'UNKNOWN_FIELD' }),
          ]),
        );
      }

      try {
        validateLoginInput({
          email: { $ne: null },
          password: { $gt: '' },
        });
        expect.fail('Should have rejected object fields');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.code).toBe('VALIDATION_FAILED');
        expect(appErr.details.fields).toHaveLength(2);
      }
    });
  });

  describe('Password hashing, JWT & DTO projections', () => {
    it('hashes and verifies passwords accurately using scrypt', async () => {
      const hash = await hashPassword('CorrectHorseBatteryStaple!');
      expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/u);
      expect(await verifyPassword('CorrectHorseBatteryStaple!', hash)).toBe(
        true,
      );
      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('signs and verifies HS256 JWTs and rejects expired or tampered tokens', () => {
      const secret = 'test-jwt-secret-key-with-at-least-32-characters';
      const now = new Date('2026-11-04T12:00:00.000Z');
      const iat = Math.floor(now.getTime() / 1000);
      const exp = iat + 3600;

      const token = signJwt(
        {
          sub: '507f1f77bcf86cd799439011',
          sid: '507f1f77bcf86cd799439022',
          authVersion: 2,
          iat,
          exp,
        },
        secret,
        { issuer: 'chiikaiwa', audience: 'chiikaiwa-web' },
      );

      const verified = verifyJwt(token, secret, {
        issuer: 'chiikaiwa',
        audience: 'chiikaiwa-web',
        now,
      });
      expect(verified).toEqual({
        sub: '507f1f77bcf86cd799439011',
        sid: '507f1f77bcf86cd799439022',
        authVersion: 2,
        iat,
        exp,
      });

      // Expired token
      expect(
        verifyJwt(token, secret, {
          issuer: 'chiikaiwa',
          audience: 'chiikaiwa-web',
          now: new Date((exp + 1) * 1000),
        }),
      ).toBeNull();

      // Wrong secret
      expect(
        verifyJwt(token, 'wrong-secret-key-with-at-least-32-characters', {
          issuer: 'chiikaiwa',
          audience: 'chiikaiwa-web',
          now,
        }),
      ).toBeNull();
    });

    it('projects Self and Partner DTOs without leaking passwordHash, emailKey, or partner email', () => {
      const userDoc = {
        _id: '507f1f77bcf86cd799439011',
        email: 'learner@example.com',
        emailKey: 'learner@example.com',
        passwordHash: 'scrypt$secret',
        displayName: 'Hạnh Nhi',
        avatarKey: 'chiikawa',
        role: 'learner',
        status: 'active',
        authVersion: 3,
        version: 5,
        profile: {
          level: 'N4',
          interests: ['music', 'travel'],
        },
      };

      const selfDto = toSelfDto(userDoc);
      expect(selfDto).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'learner@example.com',
        displayName: 'Hạnh Nhi',
        avatarKey: 'chiikawa',
        role: 'learner',
        profile: {
          level: 'N4',
          interests: ['music', 'travel'],
        },
        version: 5,
      });
      expect(selfDto).not.toHaveProperty('passwordHash');
      expect(selfDto).not.toHaveProperty('emailKey');
      expect(selfDto).not.toHaveProperty('authVersion');

      const partnerDto = toPartnerDto(userDoc);
      expect(partnerDto).toEqual({
        actorKey: 'user:507f1f77bcf86cd799439011',
        displayName: 'Hạnh Nhi',
        avatarKey: 'chiikawa',
        profile: {
          level: 'N4',
          interests: ['music', 'travel'],
        },
      });
      expect(partnerDto).not.toHaveProperty('email');
      expect(partnerDto).not.toHaveProperty('passwordHash');
    });
  });

  describe('Trusted proxy boundary & getClientIp resolution', () => {
    it('ignores spoofed X-Forwarded-For headers on direct connections when TRUSTED_PROXY_IPS is not configured', () => {
      const fakeReq = /** @type {any} */ ({
        socket: { remoteAddress: '::ffff:127.0.0.1' },
        headers: { 'x-forwarded-for': '192.0.2.10, 198.51.100.5' },
      });

      const ip = getClientIp(fakeReq, {
        envSource: { NODE_ENV: 'test', APP_ORIGIN: DEFAULT_ORIGIN },
      });
      expect(ip).toBe('127.0.0.1');
    });

    it('ignores X-Forwarded-For when socket peer is not in TRUSTED_PROXY_IPS', () => {
      const fakeReq = /** @type {any} */ ({
        socket: { remoteAddress: '192.168.1.50' },
        headers: { 'x-forwarded-for': '203.0.113.99' },
      });

      const ip = getClientIp(fakeReq, {
        envSource: {
          NODE_ENV: 'test',
          APP_ORIGIN: DEFAULT_ORIGIN,
          TRUSTED_PROXY_IPS: '10.0.0.1,10.0.0.2',
        },
      });
      expect(ip).toBe('192.168.1.50');
    });

    it('extracts the rightmost untrusted hop appended by a configured trusted proxy and ignores client-prepended spoofed IPs', () => {
      const fakeReq = /** @type {any} */ ({
        socket: { remoteAddress: '::ffff:10.0.0.1' },
        headers: {
          'x-forwarded-for': '198.51.100.250, 203.0.113.42, 10.0.0.2',
        },
      });

      const ip = getClientIp(fakeReq, {
        envSource: {
          NODE_ENV: 'test',
          APP_ORIGIN: DEFAULT_ORIGIN,
          TRUSTED_PROXY_IPS: '10.0.0.1, 10.0.0.2',
        },
      });
      expect(ip).toBe('203.0.113.42');
    });

    it('uses validated x-vercel-forwarded-for when VERCEL is enabled, ignoring spoofed X-Forwarded-For', () => {
      const fakeReq = /** @type {any} */ ({
        socket: { remoteAddress: '10.20.0.5' },
        headers: {
          'x-vercel-forwarded-for': '::ffff:203.0.113.42',
          'x-forwarded-for': '198.51.100.250, 198.51.100.251',
        },
      });

      const ip = getClientIp(fakeReq, {
        envSource: {
          NODE_ENV: 'production',
          APP_ORIGIN: 'https://chiikaiwa.example.com',
          VERCEL: '1',
        },
      });
      expect(ip).toBe('203.0.113.42');
    });

    it('ignores x-vercel-forwarded-for when VERCEL is unset or disabled', () => {
      const fakeReq = /** @type {any} */ ({
        socket: { remoteAddress: '192.168.1.50' },
        headers: { 'x-vercel-forwarded-for': '203.0.113.42' },
      });

      expect(
        getClientIp(fakeReq, {
          envSource: { NODE_ENV: 'test', APP_ORIGIN: DEFAULT_ORIGIN },
        }),
      ).toBe('192.168.1.50');

      expect(
        getClientIp(fakeReq, {
          envSource: {
            NODE_ENV: 'test',
            APP_ORIGIN: DEFAULT_ORIGIN,
            VERCEL: '0',
          },
        }),
      ).toBe('192.168.1.50');
    });

    it('extracts the first validated hop when x-vercel-forwarded-for is comma-separated', () => {
      const commaListReq = /** @type {any} */ ({
        socket: { remoteAddress: '10.20.0.5' },
        headers: { 'x-vercel-forwarded-for': '198.51.100.1, 203.0.113.9' },
      });
      expect(
        getClientIp(commaListReq, {
          envSource: { NODE_ENV: 'production', VERCEL: '1' },
        }),
      ).toBe('198.51.100.1');

      const mappedCommaReq = /** @type {any} */ ({
        socket: { remoteAddress: '10.20.0.5' },
        headers: {
          'x-vercel-forwarded-for': '  ::ffff:198.51.100.1 , 203.0.113.9 ',
        },
      });
      expect(
        getClientIp(mappedCommaReq, {
          envSource: { NODE_ENV: 'production', VERCEL: '1' },
        }),
      ).toBe('198.51.100.1');
    });

    it('falls back to socket IP when x-vercel-forwarded-for is missing or invalid', () => {
      const missingReq = /** @type {any} */ ({
        socket: { remoteAddress: '::ffff:10.20.0.5' },
        headers: {},
      });
      expect(
        getClientIp(missingReq, {
          envSource: { NODE_ENV: 'production', VERCEL: '1' },
        }),
      ).toBe('10.20.0.5');

      const invalidReq = /** @type {any} */ ({
        socket: { remoteAddress: '::ffff:10.20.0.5' },
        headers: { 'x-vercel-forwarded-for': 'not-an-ip' },
      });
      expect(
        getClientIp(invalidReq, {
          envSource: { NODE_ENV: 'production', VERCEL: '1' },
        }),
      ).toBe('10.20.0.5');

      const invalidFirstHopReq = /** @type {any} */ ({
        socket: { remoteAddress: '10.20.0.5' },
        headers: { 'x-vercel-forwarded-for': 'not-an-ip, 203.0.113.9' },
      });
      expect(
        getClientIp(invalidFirstHopReq, {
          envSource: { NODE_ENV: 'production', VERCEL: '1' },
        }),
      ).toBe('10.20.0.5');
    });

    it('logs a warning without echoing raw values and falls back to socket IP when TRUSTED_PROXY_IPS is invalid', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const fakeReq = /** @type {any} */ ({
          socket: { remoteAddress: '192.168.1.50' },
          headers: { 'x-forwarded-for': '203.0.113.99' },
        });

        const ip = getClientIp(fakeReq, {
          envSource: {
            NODE_ENV: 'test',
            TRUSTED_PROXY_IPS: 'invalid-proxy-token-secret',
          },
        });
        expect(ip).toBe('192.168.1.50');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = String(warnSpy.mock.calls[0]?.[0] ?? '');
        expect(logged).toContain('rate_limit_invalid_trusted_proxy_ips');
        expect(logged).toContain(
          'TRUSTED_PROXY_IPS must contain valid IP addresses',
        );
        expect(logged).not.toContain('invalid-proxy-token-secret');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('groups IPv6 addresses in the same /64 prefix into the same rate-limit bucket while keeping IPv4 and distinct /64s separate', () => {
      const addrA = normalizeRateLimitIp('2001:db8:abcd:12::1');
      const addrB = normalizeRateLimitIp(
        '2001:0DB8:ABCD:0012:ffff:1234:5678:9abc',
      );
      expect(addrA).toBe('2001:0db8:abcd:0012::/64');
      expect(addrB).toBe('2001:0db8:abcd:0012::/64');
      expect(hashRateLimitSubject(addrA)).toBe(hashRateLimitSubject(addrB));

      const otherSubnet = normalizeRateLimitIp('2001:db8:abcd:13::1');
      expect(otherSubnet).toBe('2001:0db8:abcd:0013::/64');
      expect(hashRateLimitSubject(otherSubnet)).not.toBe(
        hashRateLimitSubject(addrA),
      );

      expect(normalizeRateLimitIp('203.0.113.1')).toBe('203.0.113.1');
      expect(normalizeRateLimitIp('203.0.113.2')).toBe('203.0.113.2');
      expect(normalizeRateLimitIp('::ffff:203.0.113.5')).toBe('203.0.113.5');
      expect(normalizeRateLimitIp('0:0:0:0:0:ffff:203.0.113.5')).toBe(
        '203.0.113.5',
      );
      expect(normalizeRateLimitIp('::ffff:cb00:7105')).toBe('203.0.113.5');
    });
  });
});
