import { isIP } from 'node:net';

const DEFAULT_DEV_JWT_SECRET =
  'chiikaiwa-dev-only-jwt-secret-key-at-least-32-bytes';

/**
 * Normalizes an IP address string (strips IPv4-mapped IPv6 prefix `::ffff:`).
 * @param {string} rawIp
 * @returns {string}
 */
export function normalizeIpAddress(rawIp) {
  const trimmed = rawIp.trim();
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    const mapped = trimmed.slice(7);
    if (isIP(mapped) === 4) {
      return mapped;
    }
  }
  return trimmed;
}

/**
 * Parses and validates TRUSTED_PROXY_IPS comma-separated list.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseTrustedProxyIps(raw) {
  if (!raw || !raw.trim()) {
    return [];
  }
  const list = raw
    .split(',')
    .map((item) => normalizeIpAddress(item))
    .filter(Boolean);
  for (const ip of list) {
    if (isIP(ip) === 0) {
      throw new Error('TRUSTED_PROXY_IPS must contain valid IP addresses');
    }
  }
  return list;
}

/** @param {NodeJS.ProcessEnv} [source] */
export function readAuthEnv(source = process.env) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const originValue = source.APP_ORIGIN ?? 'http://127.0.0.1:5173';
  if (!URL.canParse(originValue)) {
    throw new Error('APP_ORIGIN must be a valid HTTP origin');
  }
  const origin = new URL(originValue);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.origin !== origin.href.replace(/\/$/u, '')
  ) {
    throw new Error(
      'APP_ORIGIN must be an HTTP origin without a path or credentials',
    );
  }
  if (nodeEnv === 'production' && origin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production');
  }

  const rawJwtSecret = source.JWT_SECRET;
  if (nodeEnv === 'production' && (!rawJwtSecret || rawJwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  const jwtSecret = rawJwtSecret ?? DEFAULT_DEV_JWT_SECRET;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  const trustedProxyIps = parseTrustedProxyIps(source.TRUSTED_PROXY_IPS);

  return {
    nodeEnv,
    origin: origin.origin,
    secureCookies: nodeEnv === 'production' || origin.protocol === 'https:',
    jwtSecret: jwtSecret || DEFAULT_DEV_JWT_SECRET,
    jwtIssuer: source.JWT_ISSUER ?? 'chiikaiwa',
    jwtAudience: source.JWT_AUDIENCE ?? 'chiikaiwa-web',
    trustedProxyIps,
  };
}

/** @param {NodeJS.ProcessEnv} [source] */
export function readEnv(source = process.env) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const mongodbUri = source.MONGODB_URI;
  if (!mongodbUri || !/^mongodb(?:\+srv)?:\/\//u.test(mongodbUri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI');
  }
  const dbName = source.MONGODB_DB_NAME;
  if (!dbName || !/^[a-zA-Z0-9_-]+$/u.test(dbName)) {
    throw new Error(
      'MONGODB_DB_NAME must contain only letters, numbers, underscores or hyphens',
    );
  }
  const authEnv = readAuthEnv(source);
  return {
    ...authEnv,
    port: integer(source.PORT, 3000, 65535, 'PORT'),
    mongodbUri,
    dbName,
    maxPoolSize: integer(
      source.MONGODB_MAX_POOL_SIZE,
      5,
      100,
      'MONGODB_MAX_POOL_SIZE',
    ),
    serverSelectionTimeoutMS: integer(
      source.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      5000,
      60000,
      'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
    ),
  };
}

/** @param {string | undefined} raw @param {number} fallback @param {number} maximum @param {string} name */
function integer(raw, fallback, maximum, name) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}
