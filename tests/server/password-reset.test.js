import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
} from '../../server/integrations/brevo.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../../server/modules/identity/crypto.js';
import {
  validatePasswordChangeInput,
  validatePasswordResetInput,
  validatePasswordResetRequestInput,
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
  return { csrfToken, cookieHeader };
}

describe('BE-007 Password change & reset unit and HTTP contract checks', () => {
  const app = createApp({ checkHealth: async () => {} });

  describe('Reset token generation & SHA-256 hashing', () => {
    it('generates URL-safe 256-bit random tokens and hashes them deterministically with SHA-256', () => {
      const tokenA = generatePasswordResetToken();
      const tokenB = generatePasswordResetToken();

      expect(tokenA).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(tokenB).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(tokenA).not.toBe(tokenB);

      const hashA1 = hashPasswordResetToken(tokenA);
      const hashA2 = hashPasswordResetToken(tokenA);
      const hashB = hashPasswordResetToken(tokenB);

      expect(hashA1).toMatch(/^[0-9a-f]{64}$/u);
      expect(hashA1).toBe(hashA2);
      expect(hashA1).not.toBe(hashB);
      expect(hashA1).not.toContain(tokenA);
    });
  });

  describe('Brevo transactional email adapter (server/integrations/brevo.js)', () => {
    it('builds reset URLs using APP_ORIGIN and /reset-password?token=...', () => {
      const url = buildPasswordResetUrl({
        origin: 'https://chiikaiwa.vercel.app',
        token: 'raw-token_123-abc',
      });
      expect(url).toBe(
        'https://chiikaiwa.vercel.app/reset-password?token=raw-token_123-abc',
      );
    });

    it('sends transactional email via Brevo HTTPS API with escaped HTML, 15-minute notice, and timeout signal', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<msg-123@brevo.example>' }),
      });

      const env = /** @type {any} */ ({
        NODE_ENV: 'development',
        APP_ORIGIN: 'https://chiikaiwa.vercel.app',
        BREVO_API_KEY: 'xkeysib-secret-key-do-not-leak',
        BREVO_SENDER_EMAIL: 'no-reply@chiikaiwa.example.com',
        BREVO_SENDER_NAME: 'Chiikaiwa Team',
        BREVO_TIMEOUT_MS: '4000',
      });

      const res = await sendPasswordResetEmail(
        {
          toEmail: 'learner@example.com',
          displayName: 'Hạnh <Nhi> & "Friends"',
          resetToken: 'token_abc_123',
        },
        {
          env,
          fetchImpl: /** @type {any} */ (fetchMock),
        },
      );

      expect(res).toEqual({ messageId: '<msg-123@brevo.example>' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [calledUrl, requestInit] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://api.brevo.com/v3/smtp/email');
      expect(requestInit.method).toBe('POST');
      expect(requestInit.headers['api-key']).toBe(
        'xkeysib-secret-key-do-not-leak',
      );
      expect(requestInit.signal).toBeDefined();

      const parsedBody = JSON.parse(requestInit.body);
      expect(parsedBody.sender).toEqual({
        name: 'Chiikaiwa Team',
        email: 'no-reply@chiikaiwa.example.com',
      });
      expect(parsedBody.to).toEqual([
        {
          email: 'learner@example.com',
          name: 'Hạnh <Nhi> & "Friends"',
        },
      ]);
      expect(parsedBody.textContent).toContain('15 phút');
      expect(parsedBody.textContent).toContain(
        'https://chiikaiwa.vercel.app/reset-password?token=token_abc_123',
      );
      expect(parsedBody.htmlContent).toContain(
        'Hạnh &lt;Nhi&gt; &amp; &quot;Friends&quot;',
      );
      expect(parsedBody.htmlContent).toContain(
        'https://chiikaiwa.vercel.app/reset-password?token=token_abc_123',
      );
    });

    it('throws 503 SERVICE_UNAVAILABLE without leaking secrets, tokens, or emails when Brevo fails, times out, or is unconfigured', async () => {
      const secretKey = 'xkeysib-ultra-secret-key';
      const secretToken = 'raw-reset-token-secret-value';
      const targetEmail = 'private.learner@example.com';

      // 1. Missing Brevo config
      await expect(
        sendPasswordResetEmail(
          { toEmail: targetEmail, resetToken: secretToken },
          { env: /** @type {any} */ ({ NODE_ENV: 'test' }) },
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
      });

      // 2. Non-2xx response from Brevo
      const failingFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Provider error' }),
      });

      try {
        await sendPasswordResetEmail(
          { toEmail: targetEmail, resetToken: secretToken },
          {
            env: /** @type {any} */ ({
              NODE_ENV: 'test',
              BREVO_API_KEY: secretKey,
              BREVO_SENDER_EMAIL: 'no-reply@example.com',
            }),
            fetchImpl: /** @type {any} */ (failingFetch),
          },
        );
        expect.fail('Expected sendPasswordResetEmail to throw 503');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(503);
        expect(appErr.code).toBe('SERVICE_UNAVAILABLE');
        expect(appErr.message).not.toContain(secretKey);
        expect(appErr.message).not.toContain(secretToken);
        expect(appErr.message).not.toContain(targetEmail);
      }

      // 3. Network timeout / AbortError
      const timeoutFetch = vi
        .fn()
        .mockRejectedValue(
          new DOMException('The operation was aborted', 'TimeoutError'),
        );

      await expect(
        sendPasswordResetEmail(
          { toEmail: targetEmail, resetToken: secretToken },
          {
            env: /** @type {any} */ ({
              NODE_ENV: 'test',
              BREVO_API_KEY: secretKey,
              BREVO_SENDER_EMAIL: 'no-reply@example.com',
            }),
            fetchImpl: /** @type {any} */ (timeoutFetch),
          },
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    });
  });

  describe('Input validation for password-change, password-reset-requests, and password-resets', () => {
    it('validates password-change input without trimming passwords and enforces 8..128 Unicode code points', () => {
      const valid = validatePasswordChangeInput({
        currentPassword: '  oldPass123  ',
        newPassword: '🌸'.repeat(8),
      });
      expect(valid.currentPassword).toBe('  oldPass123  ');
      expect(valid.newPassword).toBe('🌸'.repeat(8));

      try {
        validatePasswordChangeInput({
          currentPassword: '',
          newPassword: 'short',
          extraField: true,
        });
        expect.fail('Should reject invalid password-change input');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.code).toBe('VALIDATION_FAILED');
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'extraField',
              code: 'UNKNOWN_FIELD',
            }),
            expect.objectContaining({
              path: 'currentPassword',
              code: 'REQUIRED',
            }),
            expect.objectContaining({
              path: 'newPassword',
              code: 'INVALID_LENGTH',
            }),
          ]),
        );
      }
    });

    it('validates password-reset-requests input and normalizes emailKey', () => {
      const valid = validatePasswordResetRequestInput({
        email: '  Hanh.Nhi+Reset@Example.COM ',
      });
      expect(valid.email).toBe('Hanh.Nhi+Reset@Example.COM');
      expect(valid.emailKey).toBe('hanh.nhi+reset@example.com');

      try {
        validatePasswordResetRequestInput({
          email: 'invalid-email',
          role: 'admin',
        });
        expect.fail('Should reject invalid password-reset-requests input');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.code).toBe('VALIDATION_FAILED');
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'role', code: 'UNKNOWN_FIELD' }),
            expect.objectContaining({ path: 'email', code: 'INVALID_EMAIL' }),
          ]),
        );
      }
    });

    it('validates password-resets input and rejects operator objects, empty tokens, and invalid newPassword', () => {
      const valid = validatePasswordResetInput({
        token: '  valid_token_string  ',
        newPassword: '  ValidNewPassword123  ',
      });
      expect(valid.token).toBe('valid_token_string');
      // newPassword must NOT be trimmed
      expect(valid.newPassword).toBe('  ValidNewPassword123  ');

      try {
        validatePasswordResetInput({
          token: { $ne: null },
          newPassword: '1234567',
          unknown: 1,
        });
        expect.fail('Should reject invalid password-resets input');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.code).toBe('VALIDATION_FAILED');
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'unknown', code: 'UNKNOWN_FIELD' }),
            expect.objectContaining({ path: 'token', code: 'INVALID_TYPE' }),
            expect.objectContaining({
              path: 'newPassword',
              code: 'INVALID_LENGTH',
            }),
          ]),
        );
      }
    });
  });

  describe('CSRF, Origin & Guard enforcement on password endpoints', () => {
    it.each([
      '/api/v1/auth/password-change',
      '/api/v1/auth/password-reset-requests',
      '/api/v1/auth/password-resets',
    ])(
      'rejects %s without valid CSRF/Origin with 403 CSRF_INVALID',
      async (endpoint) => {
        const { csrfToken, cookieHeader } = await fetchCsrf(app);

        const missingOrigin = await request(app)
          .post(endpoint)
          .set('Cookie', cookieHeader)
          .set('X-CSRF-Token', csrfToken)
          .send({})
          .expect(403);
        expect(missingOrigin.body.error.code).toBe('CSRF_INVALID');

        const missingCsrf = await request(app)
          .post(endpoint)
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', cookieHeader)
          .send({})
          .expect(403);
        expect(missingCsrf.body.error.code).toBe('CSRF_INVALID');
      },
    );

    it('rejects unauthenticated POST /api/v1/auth/password-change with 401 AUTH_REQUIRED', async () => {
      const { csrfToken, cookieHeader } = await fetchCsrf(app);

      const res = await request(app)
        .post('/api/v1/auth/password-change')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        })
        .expect(401);

      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
