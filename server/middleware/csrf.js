import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  CSRF_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  parseCookies,
  serializeCookie,
} from './cookies.js';
import { AppError } from './http-error.js';

const CSRF_TOKEN_REGEX = /^[0-9a-f]{64}$/iu;
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Issues or refreshes a CSRF token and sets the HttpOnly protection cookie.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {{ secure: boolean }} options
 * @returns {string}
 */
export function issueCsrfToken(request, response, { secure }) {
  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[CSRF_COOKIE_NAME];
  const csrfToken =
    typeof existing === 'string' && CSRF_TOKEN_REGEX.test(existing)
      ? existing.toLowerCase()
      : randomBytes(32).toString('hex');

  response.append(
    'Set-Cookie',
    serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
    }),
  );

  return csrfToken;
}

/**
 * Middleware that enforces Origin allowlist and X-CSRF-Token matching on all browser mutating requests.
 * Webhook and maintenance routes use their own server-to-server verification and are excluded.
 *
 * @param {{ getOrigin: () => string }} options
 * @returns {import('express').RequestHandler}
 */
export function createCsrfMiddleware({ getOrigin }) {
  return (request, _response, next) => {
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      return next();
    }

    const path = request.path || request.url || '';
    if (
      path.startsWith('/webhooks/') ||
      path === '/webhooks' ||
      path.startsWith('/maintenance/') ||
      path === '/maintenance' ||
      path.startsWith('/api/v1/webhooks') ||
      path.startsWith('/api/v1/maintenance')
    ) {
      return next();
    }

    let allowedOrigin;
    try {
      allowedOrigin = getOrigin();
    } catch (err) {
      return next(err);
    }

    const originHeader = request.get('origin');
    if (!originHeader || originHeader !== allowedOrigin) {
      return next(
        new AppError({
          status: 403,
          code: 'CSRF_INVALID',
          message: 'Yêu cầu bị từ chối do Origin hoặc CSRF token không hợp lệ.',
        }),
      );
    }

    const headerToken = request.get('x-csrf-token');
    const cookies = parseCookies(request.headers.cookie);
    const cookieToken = cookies[CSRF_COOKIE_NAME];

    if (
      typeof headerToken !== 'string' ||
      typeof cookieToken !== 'string' ||
      !CSRF_TOKEN_REGEX.test(headerToken) ||
      !CSRF_TOKEN_REGEX.test(cookieToken)
    ) {
      return next(
        new AppError({
          status: 403,
          code: 'CSRF_INVALID',
          message: 'Yêu cầu bị từ chối do Origin hoặc CSRF token không hợp lệ.',
        }),
      );
    }

    const headerBuf = Buffer.from(headerToken.toLowerCase(), 'utf8');
    const cookieBuf = Buffer.from(cookieToken.toLowerCase(), 'utf8');
    if (
      headerBuf.length !== cookieBuf.length ||
      !timingSafeEqual(headerBuf, cookieBuf)
    ) {
      return next(
        new AppError({
          status: 403,
          code: 'CSRF_INVALID',
          message: 'Yêu cầu bị từ chối do Origin hoặc CSRF token không hợp lệ.',
        }),
      );
    }

    return next();
  };
}
