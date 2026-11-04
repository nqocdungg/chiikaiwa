import { ApiError } from './errors.js';
import { getIdentityEpoch, getPrivateCache, setPrivateCache } from './cache.js';

/**
 * @typedef {Object} RequestOptions
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {unknown} [body]
 * @property {string} [idempotencyKey]
 * @property {string} [requestId]
 * @property {number} [timeoutMs]
 * @property {boolean} [skipCsrf]
 * @property {string} [cacheKey]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} ApiResponse
 * @property {unknown} data
 * @property {{requestId?: string, serverTime?: string}} meta
 * @property {number} epoch The identity epoch at request start
 * @property {string | null} [idempotencyKey] The Idempotency-Key used for the request, if any
 */

const IDEMPOTENCY_EXEMPT_PATHS = [
  /^\/auth\/login$/u,
  /^\/auth\/logout$/u,
  /^\/auth\/password-reset-requests$/u,
  /^\/auth\/password-resets$/u,
  /^\/auth\/register$/u,
  /^\/study\/cards\/reveal$/u,
  /\/heartbeat$/u,
];

/**
 * Generates a UUID v4 for Idempotency-Key or X-Request-Id.
 * @returns {string}
 */
export function createIdempotencyKey() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Checks whether an endpoint is exempt from Idempotency-Key receipt requirements according to 07 §2.2.
 * @param {string} path
 * @returns {boolean}
 */
export function isIdempotencyExempt(path) {
  const normalized = path.replace(/^\/api\/v1/u, '');
  return IDEMPOTENCY_EXEMPT_PATHS.some((regex) => regex.test(normalized));
}

export class ApiClient {
  /**
   * @param {Object} [config]
   * @param {string} [config.baseUrl]
   * @param {number} [config.timeoutMs]
   */
  constructor({ baseUrl = '/api/v1', timeoutMs = 15000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/u, '');
    this.timeoutMs = timeoutMs;
    /** @type {string | null} */
    this.csrfToken = null;
    /** @type {Promise<string> | null} */
    this.csrfPromise = null;
  }

  /**
   * Sets or clears the current CSRF token.
   * @param {string | null} token
   */
  setCsrfToken(token) {
    this.csrfToken = token;
  }

  /**
   * Retrieves or fetches a valid CSRF token from GET /auth/csrf.
   * @returns {Promise<string>}
   */
  async getCsrfToken() {
    if (this.csrfToken) {
      return this.csrfToken;
    }
    if (!this.csrfPromise) {
      this.csrfPromise = (async () => {
        try {
          const res = await this.request('/auth/csrf', {
            method: 'GET',
            skipCsrf: true,
          });
          const token =
            /** @type {{csrfToken?: string}} */ (res.data)?.csrfToken ?? '';
          this.csrfToken = token;
          return token;
        } finally {
          this.csrfPromise = null;
        }
      })();
    }
    return this.csrfPromise;
  }

  /**
   * Primary request method.
   * Handles credentials cookies, CSRF tokens, Idempotency-Keys, request-id, timeouts,
   * 204 responses, and standard error envelopes.
   *
   * @param {string} path Endpoint path (e.g. '/auth/login' or full URL)
   * @param {RequestOptions} [options]
   * @returns {Promise<ApiResponse>}
   */
  async request(path, options = {}) {
    const epoch = getIdentityEpoch();
    const method = (options.method ?? 'GET').toUpperCase();

    if (method === 'GET' && options.cacheKey) {
      const cached = getPrivateCache(options.cacheKey);
      if (cached !== undefined) {
        return {
          data: cached,
          meta: {
            requestId: options.requestId ?? createIdempotencyKey(),
            serverTime: new Date().toISOString(),
          },
          epoch,
          idempotencyKey: null,
        };
      }
    }

    const url = path.startsWith('http')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    const headers = new Headers(options.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const requestId = options.requestId ?? createIdempotencyKey();
    headers.set('X-Request-Id', requestId);

    // CSRF header for mutating requests
    if (isMutating && !options.skipCsrf) {
      try {
        const token = await this.getCsrfToken();
        if (token) {
          headers.set('X-CSRF-Token', token);
        }
      } catch {
        // Proceed; server will reject if CSRF is required
      }
    }

    // Idempotency-Key for non-exempt mutating requests
    /** @type {string | null} */
    let idempotencyKey = null;
    if (isMutating && !isIdempotencyExempt(path)) {
      idempotencyKey = options.idempotencyKey ?? createIdempotencyKey();
      headers.set('Idempotency-Key', idempotencyKey);
    }

    // JSON Body
    let bodyData;
    if (options.body !== undefined && options.body !== null) {
      if (
        typeof options.body === 'object' &&
        !(options.body instanceof FormData)
      ) {
        headers.set('Content-Type', 'application/json');
        bodyData = JSON.stringify(options.body);
      } else {
        bodyData = /** @type {BodyInit} */ (options.body);
      }
    }

    const controller = new AbortController();
    const timeout = options.timeoutMs ?? this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    /** @type {Response} */
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: bodyData,
        credentials: 'include',
        signal: options.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ApiError({
          status: 408,
          code: 'TIMEOUT',
          message: 'Yêu cầu vượt quá thời gian phản hồi.',
          meta: { requestId },
          idempotencyKey,
        });
      }
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi kết nối mạng.',
        meta: { requestId },
        idempotencyKey,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // 204 No Content
    if (response.status === 204) {
      return {
        data: null,
        meta: {
          requestId: response.headers.get('x-request-id') ?? requestId,
          serverTime: new Date().toISOString(),
        },
        epoch,
        idempotencyKey,
      };
    }

    // Try parsing response body
    /** @type {any} */
    let parsedBody = null;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        parsedBody = await response.json();
      } catch {
        // Non-JSON or malformed body
      }
    }

    if (!response.ok) {
      const errorObj = parsedBody?.error ?? {};
      const metaObj = parsedBody?.meta ?? {};
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;

      // Per 07 §12: 403 CSRF_INVALID must stop the operation and NOT auto-retry.
      // Clear cached token so a future user-initiated action fetches a fresh token.
      if (response.status === 403 && errorObj.code === 'CSRF_INVALID') {
        this.csrfToken = null;
      }

      throw new ApiError({
        status: response.status,
        code: errorObj.code ?? `HTTP_${response.status}`,
        message:
          errorObj.message ??
          (response.statusText || 'Yêu cầu không thành công.'),
        details: errorObj.details ?? {},
        meta: {
          requestId: metaObj.requestId ?? requestId,
          serverTime: metaObj.serverTime ?? new Date().toISOString(),
        },
        retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
        idempotencyKey,
      });
    }

    const resultData = parsedBody?.data ?? parsedBody;
    if (method === 'GET' && options.cacheKey) {
      setPrivateCache(options.cacheKey, resultData, epoch);
    }

    return {
      data: resultData,
      meta: parsedBody?.meta ?? {
        requestId: response.headers.get('x-request-id') ?? requestId,
        serverTime: new Date().toISOString(),
      },
      epoch,
      idempotencyKey,
    };
  }

  /**
   * @param {string} path
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options]
   */
  get(path, options) {
    return this.request(path, { ...options, method: 'GET' });
  }

  /**
   * @param {string} path
   * @param {unknown} [body]
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options]
   */
  post(path, body, options) {
    return this.request(path, { ...options, method: 'POST', body });
  }

  /**
   * @param {string} path
   * @param {unknown} [body]
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options]
   */
  patch(path, body, options) {
    return this.request(path, { ...options, method: 'PATCH', body });
  }

  /**
   * @param {string} path
   * @param {unknown} [body]
   * @param {Omit<RequestOptions, 'method' | 'body'>} [options]
   */
  put(path, body, options) {
    return this.request(path, { ...options, method: 'PUT', body });
  }

  /**
   * @param {string} path
   * @param {Omit<RequestOptions, 'method'>} [options]
   */
  delete(path, options) {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
