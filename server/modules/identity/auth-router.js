import express from 'express';
import { readAuthEnv } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  clearAuthSessionCookie,
  clearGuestSessionCookie,
  parseCookies,
  setAuthSessionCookie,
} from '../../middleware/cookies.js';
import { issueCsrfToken } from '../../middleware/csrf.js';
import {
  enforceLoginRateLimit,
  enforcePasswordResetRequestRateLimit,
  enforceWriteRateLimit,
  getClientIp,
} from '../../middleware/rate-limit.js';
import {
  changeUserPassword,
  formatAuthMeDto,
  loginUser,
  logoutSession,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
} from './identity-service.js';

/**
 * @param {{
 *   sendPasswordResetEmail?: (params: { toEmail: string, displayName?: string, resetToken: string }) => Promise<unknown>,
 *   waitUntil?: (promise: Promise<unknown>) => void
 * }} [options]
 */
export function createAuthRouter({ sendPasswordResetEmail, waitUntil } = {}) {
  const router = express.Router();

  // GET /api/v1/auth/csrf (P)
  router.get('/csrf', (request, response, next) => {
    try {
      const authEnv = readAuthEnv();
      const csrfToken = issueCsrfToken(request, response, {
        secure: authEnv.secureCookies,
      });
      response.status(200).json({
        data: { csrfToken },
        meta: response.locals.meta,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/register (P)
  router.post('/register', async (request, response, next) => {
    try {
      const ip = getClientIp(request);
      await enforceWriteRateLimit({ actorOrIpKey: `ip:${ip}` });
      const { user } = await registerUser(request.body);
      response.status(201).json({
        data: { user },
        meta: response.locals.meta,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/login (P)
  router.post('/login', async (request, response, next) => {
    try {
      const ip = getClientIp(request);
      // Extract emailKey if string so rate limit tracks both IP and target email hash
      const rawEmail = request.body?.email;
      const normalizedEmailKey =
        typeof rawEmail === 'string' && rawEmail.trim()
          ? rawEmail.trim().toLowerCase()
          : undefined;

      await enforceLoginRateLimit({ ip, emailKey: normalizedEmailKey });

      const { user, expiresAt, jwtToken } = await loginUser(request.body);
      const authEnv = readAuthEnv();
      setAuthSessionCookie(response, jwtToken, expiresAt, {
        secure: authEnv.secureCookies,
      });

      response.status(200).json({
        data: {
          user,
          expiresAt: expiresAt.toISOString(),
        },
        meta: response.locals.meta,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/logout (U/G)
  router.post('/logout', async (request, response, next) => {
    try {
      const authEnv = readAuthEnv();
      const cookies = parseCookies(request.headers.cookie);
      const authCookie = cookies[AUTH_COOKIE_NAME];
      const guestCookie = cookies[GUEST_COOKIE_NAME];

      const { clearAuth, clearGuest } = await logoutSession({
        authCookie,
        guestCookie,
        rawBody: request.body,
      });

      if (clearAuth) {
        clearAuthSessionCookie(response, { secure: authEnv.secureCookies });
      }
      if (clearGuest) {
        clearGuestSessionCookie(response, { secure: authEnv.secureCookies });
      }

      response.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/auth/me (U/G)
  router.get('/me', requireAuth(['U', 'G']), (_request, response) => {
    const identity = response.locals.identity;
    response.status(200).json({
      data: formatAuthMeDto(identity),
      meta: response.locals.meta,
    });
  });

  // POST /api/v1/auth/password-change (U)
  router.post(
    '/password-change',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        const identity = response.locals.identity;
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
        await changeUserPassword({
          userId: identity.userId,
          rawBody: request.body,
        });
        response.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/auth/password-reset-requests (P)
  router.post('/password-reset-requests', async (request, response, next) => {
    try {
      const ip = getClientIp(request);
      const rawEmail = request.body?.email;
      const normalizedEmailKey =
        typeof rawEmail === 'string' && rawEmail.trim()
          ? rawEmail.trim().toLowerCase()
          : undefined;

      await enforcePasswordResetRequestRateLimit({
        ip,
        emailKey: normalizedEmailKey,
      });

      const data = await requestPasswordReset(request.body, {
        sendResetEmail: sendPasswordResetEmail,
        waitUntil,
      });

      response.status(202).json({
        data,
        meta: response.locals.meta,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/password-resets (P)
  router.post('/password-resets', async (request, response, next) => {
    try {
      const ip = getClientIp(request);
      await enforceWriteRateLimit({ actorOrIpKey: `ip:${ip}` });
      await resetPasswordWithToken(request.body);
      response.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
