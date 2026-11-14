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

// Đọc khi dùng media/webhook; không làm auth/health phụ thuộc cấu hình LiveKit.
/** @param {NodeJS.ProcessEnv} [source] */
export function readLiveKitEnv(source = process.env) {
  const url = source.LIVEKIT_URL;
  if (!url || !URL.canParse(url)) {
    throw new Error('LIVEKIT_URL must be a WebSocket origin');
  }
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    !['ws:', 'wss:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/' ||
    (parsed.protocol === 'ws:' && (!local || source.NODE_ENV === 'production'))
  ) {
    throw new Error(
      'LIVEKIT_URL must use WSS (WS only for local development) without credentials or a path',
    );
  }
  const apiKey = source.LIVEKIT_API_KEY;
  const apiSecret = source.LIVEKIT_API_SECRET;
  if (!apiKey?.trim() || !apiSecret?.trim()) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
  }
  return { url: parsed.origin, apiKey, apiSecret };
}

const DEFAULT_BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_BREVO_SENDER_NAME = 'Chiikaiwa';
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

// Chỉ đọc khi gửi email transactional (reset mật khẩu), không làm health/auth thông thường phụ thuộc cấu hình Brevo.
/** @param {NodeJS.ProcessEnv} [source] */
export function readBrevoEnv(source = process.env) {
  const authEnv = readAuthEnv(source);
  const apiKey = source.BREVO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is required');
  }

  const senderEmail = source.BREVO_SENDER_EMAIL?.trim();
  if (
    !senderEmail ||
    senderEmail.length > 254 ||
    !SIMPLE_EMAIL_PATTERN.test(senderEmail)
  ) {
    throw new Error('BREVO_SENDER_EMAIL must be a valid email address');
  }

  const rawSenderName = source.BREVO_SENDER_NAME;
  const senderName =
    rawSenderName === undefined
      ? DEFAULT_BREVO_SENDER_NAME
      : rawSenderName.trim();
  if (!senderName || senderName.length > 100) {
    throw new Error('BREVO_SENDER_NAME must be between 1 and 100 characters');
  }

  const rawApiUrl = source.BREVO_API_URL ?? DEFAULT_BREVO_API_URL;
  if (!URL.canParse(rawApiUrl)) {
    throw new Error('BREVO_API_URL must be a valid HTTPS URL');
  }
  const parsedApiUrl = new URL(rawApiUrl);
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(
    parsedApiUrl.hostname,
  );
  if (
    !['http:', 'https:'].includes(parsedApiUrl.protocol) ||
    parsedApiUrl.username ||
    parsedApiUrl.password ||
    parsedApiUrl.search ||
    parsedApiUrl.hash ||
    (parsedApiUrl.protocol === 'http:' &&
      (!isLocalHost || authEnv.nodeEnv === 'production'))
  ) {
    throw new Error(
      'BREVO_API_URL must use HTTPS (HTTP only for local test/development) without credentials or query parameters',
    );
  }

  const rawTimeout = source.BREVO_TIMEOUT_MS;
  const timeoutMs = rawTimeout === undefined ? 5000 : Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30000) {
    throw new Error(
      'BREVO_TIMEOUT_MS must be an integer between 500 and 30000',
    );
  }

  return {
    apiKey,
    senderEmail,
    senderName,
    apiUrl: parsedApiUrl.toString(),
    timeoutMs,
    appOrigin: authEnv.origin,
  };
}
