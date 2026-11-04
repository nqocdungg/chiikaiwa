import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;
const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/u;

/**
 * Promisified scrypt key derivation with explicit cost parameters.
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} keylen
 * @param {{ N: number, r: number, p: number }} params
 * @returns {Promise<Buffer>}
 */
function deriveScryptKey(password, salt, keylen, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scryptCallback(
      Buffer.from(password, 'utf8'),
      salt,
      keylen,
      { N, r, p, maxmem: SCRYPT_MAXMEM },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

/**
 * Hashes a plaintext password using scrypt and a random 16-byte salt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await deriveScryptKey(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

const DUMMY_SALT_HEX = '0123456789abcdef0123456789abcdef';
const DUMMY_HASH_HEX = 'a'.repeat(SCRYPT_KEYLEN * 2);
const DUMMY_STORED_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${DUMMY_SALT_HEX}$${DUMMY_HASH_HEX}`;

/**
 * Verifies a plaintext password against a stored scrypt hash in constant time.
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !saltHex ||
    !hashHex ||
    hashHex.length % 2 !== 0
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(hashHex, 'hex');
    if (salt.length === 0 || expectedKey.length === 0) {
      return false;
    }
    const derivedKey = await deriveScryptKey(
      password,
      salt,
      expectedKey.length,
      { N, r, p },
    );
    if (derivedKey.length !== expectedKey.length) {
      return false;
    }
    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * Runs a dummy password verification to equalize response timing when an email does not exist.
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function verifyDummyPassword(password) {
  await verifyPassword(password, DUMMY_STORED_HASH);
}

/**
 * @param {string | Buffer} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * @param {string} input
 * @returns {string}
 */
function base64UrlDecodeToString(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Signs an HS256 JWT containing only minimal session identity fields (05 §6.1).
 *
 * @param {Object} claims
 * @param {string} claims.sub User ID (24-char hex)
 * @param {string} claims.sid Auth Session ID (24-char hex)
 * @param {number} claims.authVersion User authVersion
 * @param {number} claims.iat Issued-at unix timestamp (seconds)
 * @param {number} claims.exp Expiration unix timestamp (seconds)
 * @param {string} secret
 * @param {{ issuer: string, audience: string }} options
 * @returns {string}
 */
export function signJwt(claims, secret, { issuer, audience }) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: claims.sub,
      sid: claims.sid,
      authVersion: claims.authVersion,
      iat: claims.iat,
      exp: claims.exp,
      iss: issuer,
      aud: audience,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Verifies an HS256 JWT signature, algorithm, issuer, audience, and expiration.
 *
 * @param {string} token
 * @param {string} secret
 * @param {{ issuer: string, audience: string, now?: Date }} options
 * @returns {{ sub: string, sid: string, authVersion: number, iat: number, exp: number } | null}
 */
export function verifyJwt(
  token,
  secret,
  { issuer, audience, now = new Date() },
) {
  if (typeof token !== 'string' || !token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  const sigBuf = Buffer.from(signatureB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecodeToString(headerB64));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') {
      return null;
    }

    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const nowSec = Math.floor(now.getTime() / 1000);
    if (
      payload.iss !== issuer ||
      payload.aud !== audience ||
      typeof payload.sub !== 'string' ||
      !OBJECT_ID_HEX_REGEX.test(payload.sub) ||
      typeof payload.sid !== 'string' ||
      !OBJECT_ID_HEX_REGEX.test(payload.sid) ||
      !Number.isInteger(payload.authVersion) ||
      payload.authVersion < 0 ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= nowSec
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      sid: payload.sid,
      authVersion: payload.authVersion,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies JWT signature and structure while ignoring expiration so logout can revoke an expired token's session record.
 *
 * @param {string} token
 * @param {string} secret
 * @param {{ issuer: string, audience: string }} options
 * @returns {{ sub: string, sid: string } | null}
 */
export function verifyJwtIgnoreExpiration(token, secret, { issuer, audience }) {
  if (typeof token !== 'string' || !token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  const sigBuf = Buffer.from(signatureB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecodeToString(headerB64));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') {
      return null;
    }
    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    if (
      payload?.iss !== issuer ||
      payload?.aud !== audience ||
      typeof payload?.sub !== 'string' ||
      !OBJECT_ID_HEX_REGEX.test(payload.sub) ||
      typeof payload?.sid !== 'string' ||
      !OBJECT_ID_HEX_REGEX.test(payload.sid)
    ) {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

/**
 * Hashes a guest credential cookie secret using SHA-256.
 * @param {string} credential
 * @returns {string}
 */
export function hashGuestCredential(credential) {
  return createHash('sha256').update(credential).digest('hex');
}
