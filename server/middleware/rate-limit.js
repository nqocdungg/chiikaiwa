import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { normalizeIpAddress, parseTrustedProxyIps } from '../config/env.js';
import { connectDatabase } from '../persistence/database.js';
import { AppError } from './http-error.js';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 10;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX = 3;
export const PASSWORD_RESET_IP_RATE_LIMIT_MAX = 20;
export const INVITATION_CODE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const INVITATION_CODE_RATE_LIMIT_MAX = 20;
export const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const WRITE_RATE_LIMIT_MAX = 120;

/**
 * Hashes a subject identifier (e.g. emailKey or IP) with SHA-256 so raw PII is never stored in rate_limits._id.
 * @param {string} value
 * @returns {string}
 */
export function hashRateLimitSubject(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Parses an IPv6 address (with optional `::` compression and trailing IPv4 notation)
 * into eight 16-bit integer groups.
 * @param {string} ipv6
 * @returns {number[] | null}
 */
function parseIpv6Groups(ipv6) {
  const parseSegment = (/** @type {string} */ segment) => {
    if (!segment) return [];
    const parts = segment.split(':');
    /** @type {number[]} */
    const groups = [];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.includes('.')) {
        if (i !== parts.length - 1 || isIP(part) !== 4) {
          return null;
        }
        const octets = part.split('.').map(Number);
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/iu.test(part)) {
          return null;
        }
        groups.push(Number.parseInt(part, 16));
      }
    }
    return groups;
  };

  const doubleColonIndex = ipv6.indexOf('::');
  if (doubleColonIndex === -1) {
    const groups = parseSegment(ipv6);
    return groups && groups.length === 8 ? groups : null;
  }

  const leftRaw = ipv6.slice(0, doubleColonIndex);
  const rightRaw = ipv6.slice(doubleColonIndex + 2);
  if (rightRaw.includes('::')) {
    return null;
  }
  const left = parseSegment(leftRaw);
  const right = parseSegment(rightRaw);
  if (!left || !right) {
    return null;
  }
  const missing = 8 - (left.length + right.length);
  if (missing < 1) {
    return null;
  }
  return [...left, ...Array(missing).fill(0), ...right];
}

/**
 * Normalizes an IP address for rate-limit bucketing:
 * preserves IPv4 addresses (including IPv4-mapped IPv6 forms) and collapses IPv6
 * addresses to their canonical `/64` prefix so rotating host bits cannot bypass IP limits.
 *
 * @param {string} rawIp
 * @returns {string}
 */
export function normalizeRateLimitIp(rawIp) {
  const normalized = normalizeIpAddress(String(rawIp));
  const version = isIP(normalized);
  if (version !== 6) {
    return normalized;
  }

  const groups = parseIpv6Groups(normalized);
  if (!groups) {
    return normalized;
  }

  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const hi = groups[6];
    const lo = groups[7];
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  const prefix = groups
    .slice(0, 4)
    .map((group) => group.toString(16).padStart(4, '0'))
    .join(':');
  return `${prefix}::/64`;
}

/**
 * Returns true when running in a Vercel deployment environment.
 * @param {NodeJS.ProcessEnv} envSource
 * @returns {boolean}
 */
function isVercelRuntime(envSource) {
  const raw = envSource.VERCEL?.trim().toLowerCase();
  return Boolean(raw && raw !== '0' && raw !== 'false');
}

/**
 * Extracts client IP address safely according to trusted proxy boundaries.
 * On Vercel (`VERCEL` env set), uses the first validated hop from the platform-injected
 * `x-vercel-forwarded-for` header, falling back to the socket IP when missing or invalid.
 * Outside Vercel, direct connections ignore client-supplied `x-forwarded-for` headers;
 * when the immediate socket peer is in `TRUSTED_PROXY_IPS`, resolves the rightmost
 * untrusted hop appended by the trusted proxy chain.
 *
 * @param {import('express').Request} request
 * @param {{ envSource?: NodeJS.ProcessEnv }} [options]
 * @returns {string}
 */
export function getClientIp(request, { envSource = process.env } = {}) {
  const rawSocketIp =
    request.socket?.remoteAddress || request.ip || '127.0.0.1';
  const socketIp = normalizeIpAddress(String(rawSocketIp));

  if (isVercelRuntime(envSource)) {
    const vercelForwarded = request.headers['x-vercel-forwarded-for'];
    const rawHeader = Array.isArray(vercelForwarded)
      ? vercelForwarded[0]
      : vercelForwarded;
    if (typeof rawHeader === 'string') {
      const firstHop = rawHeader.split(',')[0] ?? '';
      const candidate = normalizeIpAddress(firstHop);
      if (candidate && isIP(candidate) !== 0) {
        return candidate;
      }
    }
    return socketIp;
  }

  /** @type {string[]} */
  let trustedProxyIps;
  try {
    trustedProxyIps = parseTrustedProxyIps(envSource.TRUSTED_PROXY_IPS);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'rate_limit_invalid_trusted_proxy_ips',
        message:
          error instanceof Error
            ? error.message
            : 'TRUSTED_PROXY_IPS must contain valid IP addresses',
      }),
    );
    trustedProxyIps = [];
  }

  if (trustedProxyIps.length === 0 || !trustedProxyIps.includes(socketIp)) {
    return socketIp;
  }

  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded !== 'string' || !forwarded.trim()) {
    return socketIp;
  }

  const chain = forwarded
    .split(',')
    .map((part) => normalizeIpAddress(part))
    .filter(Boolean);

  if (chain.length === 0) {
    return socketIp;
  }

  let fallbackIp = socketIp;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const candidate = chain[i];
    if (!candidate || isIP(candidate) === 0) {
      return fallbackIp;
    }
    if (i > 0 && trustedProxyIps.includes(candidate)) {
      fallbackIp = candidate;
      continue;
    }
    return candidate;
  }

  return fallbackIp;
}

/**
 * Increments a rate-limit bucket atomically in the `rate_limits` collection and throws 429 if exceeded.
 *
 * @param {Object} params
 * @param {import('mongoose').mongo.Db} params.db
 * @param {string} params.scope
 * @param {string} params.subjectKey
 * @param {number} params.limit
 * @param {number} params.windowMs
 * @param {Date} [params.now]
 * @returns {Promise<{ count: number, windowEndsAt: Date }>}
 */
export async function consumeRateLimit({
  db,
  scope,
  subjectKey,
  limit,
  windowMs,
  now = new Date(),
}) {
  const nowMs = now.getTime();
  const windowBucket = Math.floor(nowMs / windowMs);
  const windowEndsAt = new Date((windowBucket + 1) * windowMs);
  const subjectHash = hashRateLimitSubject(subjectKey);
  const id = `${scope}:${subjectHash}:${windowBucket}`;
  const collection = db.collection('rate_limits');

  let doc = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      doc = await collection.findOneAndUpdate(
        /** @type {any} */ ({ _id: id }),
        {
          $inc: { count: 1 },
          $setOnInsert: {
            windowEndsAt,
            purgeAt: windowEndsAt,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      break;
    } catch (err) {
      if (
        /** @type {{ code?: number }} */ (err)?.code === 11000 &&
        attempt === 0
      ) {
        continue;
      }
      throw err;
    }
  }

  const count = typeof doc?.count === 'number' ? doc.count : 1;
  const effectiveEndsAt =
    doc?.windowEndsAt instanceof Date ? doc.windowEndsAt : windowEndsAt;

  if (count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((effectiveEndsAt.getTime() - nowMs) / 1000),
    );
    throw new AppError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    });
  }

  return { count, windowEndsAt: effectiveEndsAt };
}

/**
 * Enforces login rate limits: 10 attempts / 15 minutes per IP and per normalized emailKey hash (07 §11).
 *
 * @param {Object} params
 * @param {import('mongoose').mongo.Db} [params.db]
 * @param {string} params.ip
 * @param {string} [params.emailKey]
 * @param {Date} [params.now]
 */
export async function enforceLoginRateLimit({
  db,
  ip,
  emailKey,
  now = new Date(),
}) {
  const database = db ?? (await connectDatabase());
  await consumeRateLimit({
    db: database,
    scope: 'login-ip',
    subjectKey: normalizeRateLimitIp(ip),
    limit: LOGIN_RATE_LIMIT_MAX,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    now,
  });

  if (emailKey) {
    await consumeRateLimit({
      db: database,
      scope: 'login-email',
      subjectKey: emailKey,
      limit: LOGIN_RATE_LIMIT_MAX,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      now,
    });
  }
}

/**
 * Enforces password reset request rate limits: 20 requests / 15 minutes per IP
 * and 3 requests / 15 minutes per normalized emailKey hash (applied even when email does not exist, 07 §11).
 *
 * @param {Object} params
 * @param {import('mongoose').mongo.Db} [params.db]
 * @param {string} params.ip
 * @param {string} [params.emailKey]
 * @param {Date} [params.now]
 */
export async function enforcePasswordResetRequestRateLimit({
  db,
  ip,
  emailKey,
  now = new Date(),
}) {
  const database = db ?? (await connectDatabase());
  await consumeRateLimit({
    db: database,
    scope: 'password-reset-ip',
    subjectKey: normalizeRateLimitIp(ip),
    limit: PASSWORD_RESET_IP_RATE_LIMIT_MAX,
    windowMs: PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
    now,
  });

  if (emailKey) {
    await consumeRateLimit({
      db: database,
      scope: 'password-reset-email',
      subjectKey: emailKey,
      limit: PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX,
      windowMs: PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
      now,
    });
  }
}

/**
 * Enforces invitation-code / guest-trial lookup rate limits: 20 requests / 5 minutes per IP (07 §11).
 *
 * @param {Object} params
 * @param {import('mongoose').mongo.Db} [params.db]
 * @param {string} params.ip
 * @param {Date} [params.now]
 */
export async function enforceInvitationCodeRateLimit({
  db,
  ip,
  now = new Date(),
}) {
  const database = db ?? (await connectDatabase());
  await consumeRateLimit({
    db: database,
    scope: 'invitation-code-ip',
    subjectKey: normalizeRateLimitIp(ip),
    limit: INVITATION_CODE_RATE_LIMIT_MAX,
    windowMs: INVITATION_CODE_RATE_LIMIT_WINDOW_MS,
    now,
  });
}

/**
 * Enforces business write rate limits: 120 writes / minute per actor (or IP for unauthenticated writes).
 *
 * @param {Object} params
 * @param {import('mongoose').mongo.Db} [params.db]
 * @param {string} params.actorOrIpKey
 * @param {Date} [params.now]
 */
export async function enforceWriteRateLimit({
  db,
  actorOrIpKey,
  now = new Date(),
}) {
  const database = db ?? (await connectDatabase());
  const normalizedSubjectKey = actorOrIpKey.startsWith('ip:')
    ? `ip:${normalizeRateLimitIp(actorOrIpKey.slice(3))}`
    : actorOrIpKey;
  await consumeRateLimit({
    db: database,
    scope: 'write-actor',
    subjectKey: normalizedSubjectKey,
    limit: WRITE_RATE_LIMIT_MAX,
    windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    now,
  });
}
