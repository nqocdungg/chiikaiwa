import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  parseCookies,
} from './cookies.js';
import { AppError } from './http-error.js';
import { resolveIdentityFromCookies } from '../modules/identity/identity-service.js';

/**
 * Express middleware that authenticates the caller via session or guest cookies
 * and enforces the allowed permission roles ('U', 'G', 'A') per 07 §2.1.
 *
 * @param {Array<'U' | 'G' | 'A'>} [allowedRoles]
 * @returns {import('express').RequestHandler}
 */
export function requireAuth(allowedRoles = ['U']) {
  return async (request, response, next) => {
    try {
      const cookies = parseCookies(request.headers.cookie);
      const identity = await resolveIdentityFromCookies({
        authCookie: cookies[AUTH_COOKIE_NAME],
        guestCookie: cookies[GUEST_COOKIE_NAME],
      });

      let permitted = false;
      for (const role of allowedRoles) {
        if (role === 'U' && identity.kind === 'user') {
          permitted = true;
          break;
        }
        if (role === 'G' && identity.kind === 'guest') {
          permitted = true;
          break;
        }
        if (
          role === 'A' &&
          identity.kind === 'user' &&
          identity.role === 'admin'
        ) {
          permitted = true;
          break;
        }
      }

      if (!permitted) {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền thực hiện thao tác này.',
        });
      }

      response.locals.identity = identity;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
