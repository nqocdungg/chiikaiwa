export const AUTH_COOKIE_NAME = 'ck_session';
export const CSRF_COOKIE_NAME = 'ck_csrf';
export const GUEST_COOKIE_NAME = 'ck_guest';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

/**
 * Safely parses a Cookie header into a null-prototype map.
 * @param {string | undefined} cookieHeader
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  /** @type {Record<string, string>} */
  const cookies = Object.create(null);
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const rawPair of pairs) {
    const eqIdx = rawPair.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }
    const name = rawPair.slice(0, eqIdx).trim();
    if (!name) {
      continue;
    }
    const rawValue = rawPair.slice(eqIdx + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

/**
 * Serializes a cookie with strict security attributes (HttpOnly, SameSite=Lax, Path=/, no Domain).
 * @param {string} name
 * @param {string} value
 * @param {Object} [options]
 * @param {boolean} [options.httpOnly]
 * @param {boolean} [options.secure]
 * @param {'Lax' | 'Strict' | 'None'} [options.sameSite]
 * @param {string} [options.path]
 * @param {number} [options.maxAgeSeconds]
 * @param {Date} [options.expires]
 * @returns {string}
 */
export function serializeCookie(
  name,
  value,
  {
    httpOnly = true,
    secure = false,
    sameSite = 'Lax',
    path = '/',
    maxAgeSeconds,
    expires,
  } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (httpOnly) {
    parts.push('HttpOnly');
  }
  if (secure) {
    parts.push('Secure');
  }
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }
  if (typeof maxAgeSeconds === 'number' && Number.isFinite(maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (expires instanceof Date && !Number.isNaN(expires.getTime())) {
    parts.push(`Expires=${expires.toUTCString()}`);
  }
  return parts.join('; ');
}

/**
 * Sets the authentication session cookie (max 7 days absolute expiry).
 * @param {import('express').Response} response
 * @param {string} jwtToken
 * @param {Date} expiresAt
 * @param {{ secure: boolean, now?: Date }} options
 */
export function setAuthSessionCookie(
  response,
  jwtToken,
  expiresAt,
  { secure, now = new Date() },
) {
  const remainingSec = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  const maxAgeSeconds = Math.min(
    SESSION_MAX_AGE_SECONDS,
    Math.max(0, remainingSec),
  );
  response.append(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, jwtToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAgeSeconds,
      expires: expiresAt,
    }),
  );
}

/**
 * Clears the authentication session cookie.
 * @param {import('express').Response} response
 * @param {{ secure: boolean }} options
 */
export function clearAuthSessionCookie(response, { secure }) {
  response.append(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAgeSeconds: 0,
      expires: new Date(0),
    }),
  );
}

/**
 * Clears the guest session cookie.
 * @param {import('express').Response} response
 * @param {{ secure: boolean }} options
 */
export function clearGuestSessionCookie(response, { secure }) {
  response.append(
    'Set-Cookie',
    serializeCookie(GUEST_COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAgeSeconds: 0,
      expires: new Date(0),
    }),
  );
}
