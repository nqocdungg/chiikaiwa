import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { normalizeIpAddress, readAuthEnv } from '../config/env.js';
import { connectDatabase } from '../persistence/database.js';
import { AppError } from './http-error.js';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 10;
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
 * Extracts client IP address safely according to trusted proxy boundaries.
 * Direct connections ignore client-supplied X-Forwarded-For headers.
 * When the immediate socket peer is in TRUSTED_PROXY_IPS, resolves the rightmost
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

  /** @type {string[]} */
  let trustedProxyIps;
  try {
    trustedProxyIps = readAuthEnv(envSource).trustedProxyIps;
  } catch {
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
    subjectKey: ip,
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
  await consumeRateLimit({
    db: database,
    scope: 'write-actor',
    subjectKey: actorOrIpKey,
    limit: WRITE_RATE_LIMIT_MAX,
    windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    now,
  });
}
