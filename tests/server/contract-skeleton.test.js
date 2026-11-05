import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  AUTH_SESSION_FIXTURES,
  BOUNDARY_FIXTURES,
  DEFAULT_JWT_SECRET,
  FIXTURE_USER_IDS,
  GUEST_CREDENTIAL_HASHES,
  GUEST_SESSION_FIXTURES,
  RAW_GUEST_TOKENS,
  createAuthSessionFixtures,
  createFixtureJwt,
  createGuestSessionFixtures,
} from '../fixtures/auth-fixtures.js';
import {
  assertErrorEnvelope,
  assertNoContentEnvelope,
  assertSuccessEnvelope,
  assertValidationError,
  createTestIdempotencyKey,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import {
  validateDisplayNameField,
  validateEmailField,
  validatePasswordField,
} from '../../server/modules/identity/validation.js';
import {
  hashGuestCredential,
  verifyJwt,
} from '../../server/modules/identity/crypto.js';

describe('QA-001 Contract Testing Skeleton & Fixtures Unit Suite', () => {
  const app = createApp({ checkHealth: async () => {} });

  describe('Contract Envelope Assertions (07 §1, §12)', () => {
    it('validates standard 200 success envelope with assertSuccessEnvelope', async () => {
      const res = await request(app).get('/api/v1/health');
      assertSuccessEnvelope(res, { expectedStatus: 200 });
      expect(res.body.data).toEqual({ status: 'ok' });
    });

    it('validates standard 404 error envelope with assertErrorEnvelope', async () => {
      const res = await request(app).get(
        '/api/v1/non-existent-resource-endpoint',
      );
      assertErrorEnvelope(res, {
        expectedStatus: 404,
        expectedCode: 'RESOURCE_NOT_FOUND',
        expectedMessageSnippet: 'Không tìm thấy tài nguyên.',
      });
    });

    it('validates 400 MALFORMED_REQUEST on invalid JSON syntax', async () => {
      const res = await request(app)
        .post('/api/v1/missing')
        .set('Content-Type', 'application/json')
        .send('{ invalid-json');
      assertErrorEnvelope(res, {
        expectedStatus: 400,
        expectedCode: 'MALFORMED_REQUEST',
      });
    });

    it('validates 413 PAYLOAD_TOO_LARGE on oversized JSON body > 1 MiB', async () => {
      const oversizedPayload = { value: 'x'.repeat(1024 * 1024 + 64) };
      const res = await request(app)
        .post('/api/v1/missing')
        .send(oversizedPayload);
      assertErrorEnvelope(res, {
        expectedStatus: 413,
        expectedCode: 'PAYLOAD_TOO_LARGE',
      });
    });

    it('validates 415 UNSUPPORTED_MEDIA_TYPE when body is sent without application/json Content-Type', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Content-Type', 'text/plain')
        .send('email=test@example.com');
      assertErrorEnvelope(res, {
        expectedStatus: 415,
        expectedCode: 'UNSUPPORTED_MEDIA_TYPE',
      });
    });

    it('validates 403 CSRF_INVALID on mutating requests without valid Origin or CSRF token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user@example.com', password: 'password123' });
      assertErrorEnvelope(res, {
        expectedStatus: 403,
        expectedCode: 'CSRF_INVALID',
      });
    });

    it('validates 503 SERVICE_UNAVAILABLE error envelope without leaking connection details', async () => {
      const brokenApp = createApp({
        checkHealth: async () => {
          throw new Error(
            'mongodb://private_cluster_secret_credentials@internal-host:27017/db',
          );
        },
      });
      const res = await request(brokenApp).get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.data).toEqual({ status: 'unavailable' });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('private_cluster_secret_credentials');
    });

    it('validates mock 204 No Content with assertNoContentEnvelope', async () => {
      const mockResponse = {
        status: 204,
        text: '',
        headers: {
          'cache-control': 'no-store',
          'x-request-id': 'test-req-123',
        },
      };
      assertNoContentEnvelope(mockResponse);
    });
  });

  describe('Contract Helpers (CSRF context & Idempotency Key generators)', () => {
    it('generates compliant RFC 4122 v4 UUID for Idempotency-Key', () => {
      const key = createTestIdempotencyKey();
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      );
    });

    it('fetches CSRF token and HttpOnly SameSite=Lax cookie with fetchCsrfContext', async () => {
      const { csrfToken, csrfCookie, rawSetCookie } =
        await fetchCsrfContext(app);
      expect(csrfToken).toMatch(/^[0-9a-f]{64}$/u);
      expect(csrfCookie).toContain('ck_csrf=');
      const cookieStr = Array.isArray(rawSetCookie)
        ? rawSetCookie.join('; ')
        : String(rawSetCookie);
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Lax');
      expect(cookieStr).not.toContain('Domain=');
    });

    it('validates 422 VALIDATION_FAILED assertion checker helper', () => {
      const mock422Response = {
        status: 422,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu đầu vào không hợp lệ.',
            details: {
              fields: [
                {
                  path: 'email',
                  code: 'INVALID_EMAIL',
                  message: 'Email không đúng định dạng.',
                },
                {
                  path: 'password',
                  code: 'INVALID_LENGTH',
                  message: 'Mật khẩu quá ngắn.',
                },
              ],
            },
          },
          meta: {
            requestId: 'test-req-123',
            serverTime: new Date().toISOString(),
          },
        },
        headers: {
          'cache-control': 'no-store',
          'x-request-id': 'test-req-123',
        },
        text: '{"error":{...}}',
      };

      assertValidationError(mock422Response, [
        { path: 'email', code: 'INVALID_EMAIL' },
        { path: 'password' },
      ]);
    });
  });

  describe('Boundary Fixtures Evaluation (07 §2.3)', () => {
    it('verifies password boundaries (8..128 code points and Unicode without normalization)', () => {
      const { passwords } = BOUNDARY_FIXTURES;

      expect(validatePasswordField(passwords.validMin)).toEqual({
        password: passwords.validMin,
      });
      expect(validatePasswordField(passwords.validMax)).toEqual({
        password: passwords.validMax,
      });
      expect(validatePasswordField(passwords.validUnicode)).toEqual({
        password: passwords.validUnicode,
      });

      const shortRes = validatePasswordField(passwords.invalidTooShort);
      expect('error' in shortRes && shortRes.error.code).toBe('INVALID_LENGTH');

      const longRes = validatePasswordField(passwords.invalidTooLong);
      expect('error' in longRes && longRes.error.code).toBe('INVALID_LENGTH');
    });

    it('verifies displayName boundaries (1..100 code points with trimming)', () => {
      const { displayNames } = BOUNDARY_FIXTURES;

      expect(validateDisplayNameField(displayNames.validMin)).toEqual({
        displayName: 'A',
      });
      expect(validateDisplayNameField(displayNames.validMax)).toEqual({
        displayName: displayNames.validMax,
      });
      expect(validateDisplayNameField(displayNames.validWithSpaces)).toEqual({
        displayName: 'Nguyễn Văn A',
      });

      const emptyRes = validateDisplayNameField(displayNames.invalidEmpty);
      expect('error' in emptyRes && emptyRes.error.code).toBe('INVALID_LENGTH');

      const spacesRes = validateDisplayNameField(
        displayNames.invalidOnlySpaces,
      );
      expect('error' in spacesRes && spacesRes.error.code).toBe(
        'INVALID_LENGTH',
      );

      const longRes = validateDisplayNameField(displayNames.invalidTooLong);
      expect('error' in longRes && longRes.error.code).toBe('INVALID_LENGTH');
    });

    it('verifies email boundaries (lowercase emailKey, preserve +tags and dots)', () => {
      const { emails } = BOUNDARY_FIXTURES;

      expect(validateEmailField(emails.validSimple)).toEqual({
        email: 'user@example.com',
        emailKey: 'user@example.com',
      });

      expect(validateEmailField(emails.validWithPlusTag)).toEqual({
        email: 'user+study@example.com',
        emailKey: 'user+study@example.com',
      });

      expect(validateEmailField(emails.validUpper)).toEqual({
        email: 'USER.UPPER@EXAMPLE.COM',
        emailKey: 'user.upper@example.com',
      });

      const noAtRes = validateEmailField(emails.invalidMissingAt);
      expect('error' in noAtRes && noAtRes.error.code).toBe('INVALID_EMAIL');

      const spacesRes = validateEmailField(emails.invalidWithSpaces);
      expect('error' in spacesRes && spacesRes.error.code).toBe(
        'INVALID_EMAIL',
      );

      const controlRes = validateEmailField(emails.invalidWithControlChar);
      expect('error' in controlRes && controlRes.error.code).toBe(
        'INVALID_EMAIL',
      );
    });

    it('generates valid and verifiable JWT fixtures with createFixtureJwt', () => {
      const validJwt = createFixtureJwt();
      const claims = verifyJwt(validJwt, DEFAULT_JWT_SECRET, {
        issuer: 'chiikaiwa',
        audience: 'chiikaiwa-web',
      });
      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe(FIXTURE_USER_IDS.learnerA);

      const expiredJwt = createFixtureJwt({
        iat: Math.floor(Date.now() / 1000) - 200,
        exp: Math.floor(Date.now() / 1000) - 100,
      });
      const expiredClaims = verifyJwt(expiredJwt, DEFAULT_JWT_SECRET, {
        issuer: 'chiikaiwa',
        audience: 'chiikaiwa-web',
      });
      expect(expiredClaims).toBeNull();
    });

    it('generates consistent and verifiable guest credential hashes with hashGuestCredential', () => {
      expect(GUEST_CREDENTIAL_HASHES.active).toBe(
        hashGuestCredential(RAW_GUEST_TOKENS.active),
      );
      expect(GUEST_CREDENTIAL_HASHES.expired).toBe(
        hashGuestCredential(RAW_GUEST_TOKENS.expired),
      );
      expect(GUEST_CREDENTIAL_HASHES.active).toMatch(/^[0-9a-f]{64}$/u);
    });

    it('generates dynamic relative session expiration dates preventing self-expiring fixture failures', () => {
      const now = new Date();
      const authSessions = createAuthSessionFixtures(now);
      expect(authSessions.learnerA.expiresAt.getTime()).toBeGreaterThan(
        now.getTime(),
      );
      expect(authSessions.expired.expiresAt.getTime()).toBeLessThan(
        now.getTime(),
      );

      const guestSessions = createGuestSessionFixtures(now);
      expect(guestSessions.active.expiresAt.getTime()).toBeGreaterThan(
        now.getTime(),
      );
      expect(guestSessions.expired.expiresAt.getTime()).toBeLessThan(
        now.getTime(),
      );

      // Verify getter dynamically produces future expiration
      expect(
        AUTH_SESSION_FIXTURES.learnerA.expiresAt.getTime(),
      ).toBeGreaterThan(Date.now());
      expect(GUEST_SESSION_FIXTURES.active.expiresAt.getTime()).toBeGreaterThan(
        Date.now(),
      );
    });
  });
});
