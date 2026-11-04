import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  isIdempotencyExempt,
} from '../../client/src/services/api-client.js';
import { ApiError } from '../../client/src/services/errors.js';
import {
  clearPrivateCache,
  getIdentityEpoch,
  getPrivateCache,
  setIdentityKey,
  setPrivateCache,
} from '../../client/src/services/cache.js';

describe('ApiClient and cache isolation', () => {
  /** @type {ApiClient} */
  let client;

  beforeEach(() => {
    client = new ApiClient({ baseUrl: '/api/v1', timeoutMs: 1000 });
    clearPrivateCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('identifies idempotency exempt paths correctly according to 07 §2.2', () => {
    expect(isIdempotencyExempt('/auth/login')).toBe(true);
    expect(isIdempotencyExempt('/auth/logout')).toBe(true);
    expect(isIdempotencyExempt('/auth/password-reset-requests')).toBe(true);
    expect(isIdempotencyExempt('/auth/password-resets')).toBe(true);
    expect(isIdempotencyExempt('/auth/register')).toBe(true);
    expect(isIdempotencyExempt('/study/cards/reveal')).toBe(true);
    expect(isIdempotencyExempt('/matching/searches/123/heartbeat')).toBe(true);

    expect(isIdempotencyExempt('/me/profile')).toBe(false);
    expect(isIdempotencyExempt('/sessions/abc/draws')).toBe(false);
    expect(isIdempotencyExempt('/me/saved-items')).toBe(false);
    expect(isIdempotencyExempt('/study/reviews')).toBe(false);
  });

  it('includes credentials and Request-ID headers on GET requests without CSRF or Idempotency keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { items: [1, 2, 3] },
          meta: {
            requestId: 'req-abc',
            serverTime: '2026-11-04T00:00:00.000Z',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'req-abc',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await client.get('/catalogs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('/api/v1/catalogs');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.headers.get('Accept')).toBe('application/json');
    expect(init.headers.get('X-Request-Id')).toBeDefined();
    expect(init.headers.get('X-CSRF-Token')).toBeNull();
    expect(init.headers.get('Idempotency-Key')).toBeNull();

    expect(res.data).toEqual({ items: [1, 2, 3] });
    expect(res.meta.requestId).toBe('req-abc');
  });

  it('fetches and attaches CSRF token and Idempotency-Key on mutating requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { csrfToken: 'csrf-secret-123' },
            meta: { requestId: 'csrf-req' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: 'u1', displayName: 'Nhi' },
            meta: { requestId: 'patch-req' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await client.patch('/me/profile', {
      expectedVersion: 1,
      displayName: 'Nhi',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/csrf');
    const [patchUrl, patchInit] = fetchMock.mock.calls[1];
    expect(patchUrl).toBe('/api/v1/me/profile');
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.headers.get('X-CSRF-Token')).toBe('csrf-secret-123');
    expect(patchInit.headers.get('Idempotency-Key')).toBeDefined();
    expect(patchInit.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(patchInit.body)).toEqual({
      expectedVersion: 1,
      displayName: 'Nhi',
    });

    expect(res.data).toEqual({ id: 'u1', displayName: 'Nhi' });
  });

  it('omits Idempotency-Key for exempt paths like /auth/login and /auth/register', async () => {
    client.setCsrfToken('preset-token');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { user: { id: 'u1' } },
          meta: { requestId: 'login-req' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.post('/auth/login', { email: 'a@b.com', password: 'secret' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('X-CSRF-Token')).toBe('preset-token');
    expect(init.headers.get('Idempotency-Key')).toBeNull();
  });

  it('preserves user-provided Idempotency-Key and exposes generated key on error for retry of same intent', async () => {
    client.setCsrfToken('preset-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Hệ thống đang bận.',
            },
            meta: { requestId: 'err-503' },
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { success: true },
            meta: { requestId: 'retry-req' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    /** @type {ApiError | undefined} */
    let caughtError;
    try {
      await client.post('/study/reviews', { rating: 2 });
    } catch (err) {
      caughtError = /** @type {ApiError} */ (err);
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError?.status).toBe(503);
    expect(caughtError?.isRetryable()).toBe(true);
    const firstKey = caughtError?.idempotencyKey;
    expect(firstKey).toBeTruthy();

    // Retry the exact same intent with the preserved idempotencyKey
    await client.post(
      '/study/reviews',
      { rating: 2 },
      { idempotencyKey: firstKey ?? undefined },
    );

    const firstAttemptKey =
      fetchMock.mock.calls[0][1].headers.get('Idempotency-Key');
    const secondAttemptKey =
      fetchMock.mock.calls[1][1].headers.get('Idempotency-Key');
    expect(secondAttemptKey).toBe(firstAttemptKey);
  });

  it('stops immediately without auto-retrying when server returns 403 CSRF_INVALID per 07 §12', async () => {
    client.setCsrfToken('old-expired-csrf');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'CSRF_INVALID',
            message: 'Token CSRF không hợp lệ.',
          },
          meta: { requestId: 'err-csrf-1' },
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.post('/me/saved-items', {
        knowledgeVersionId: 'kv1',
      }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(403);
      expect(err.code).toBe('CSRF_INVALID');
      expect(err.isForbidden()).toBe(true);
      expect(err.isRetryable()).toBe(false);
      expect(err.meta.requestId).toBe('err-csrf-1');
      return true;
    });

    // Must NOT automatically retry the failed mutating request
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.csrfToken).toBeNull();
  });

  it('handles 204 No Content responses cleanly with null data', async () => {
    client.setCsrfToken('tok');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { 'X-Request-Id': 'req-204' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await client.post('/auth/logout', {});
    expect(res.data).toBeNull();
    expect(res.meta.requestId).toBe('req-204');
  });

  it('parses error envelope, field errors, and Retry-After header', async () => {
    client.setCsrfToken('tok');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Dữ liệu không hợp lệ.',
              details: {
                fields: [
                  {
                    path: 'email',
                    code: 'INVALID_SYNTAX',
                    message: 'Sai email',
                  },
                ],
              },
            },
            meta: { requestId: 'val-err-req' },
          }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              message: 'Quá nhiều yêu cầu.',
            },
            meta: { requestId: 'rate-req' },
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '45',
            },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.post('/auth/register', { email: 'bad', password: '123' }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(422);
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.isValidationError()).toBe(true);
      expect(err.isRetryable()).toBe(false);
      expect(err.getFieldErrors()).toEqual({ email: 'Sai email' });
      expect(err.meta.requestId).toBe('val-err-req');
      return true;
    });

    await expect(
      client.post('/auth/login', { email: 'a@b.com', password: '123' }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.isRateLimited()).toBe(true);
      expect(err.retryAfter).toBe(45);
      return true;
    });
  });

  it('parses 409 VERSION_CONFLICT error and details without auto-retrying on new version', async () => {
    client.setCsrfToken('tok');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
            details: { currentVersion: 8 },
          },
          meta: { requestId: 'conflict-req' },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.patch('/me/profile', { expectedVersion: 7, displayName: 'New' }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(err.isVersionConflict()).toBe(true);
      expect(err.isRetryable()).toBe(false);
      expect(err.details.currentVersion).toBe(8);
      return true;
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles network timeouts via AbortController and throws ApiError TIMEOUT', async () => {
    const fastClient = new ApiClient({ timeoutMs: 20 });
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fastClient.get('/topics')).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('TIMEOUT');
      expect(err.status).toBe(408);
      return true;
    });
  });

  it('clears private cache on identity change and prevents stale in-flight GET responses from populating cache', async () => {
    setIdentityKey('user-A');
    setPrivateCache(
      'personal-notes',
      { note: 'Note from User A' },
      getIdentityEpoch(),
    );

    expect(getPrivateCache('personal-notes')).toEqual({
      note: 'Note from User A',
    });

    /** @type {(value: Response) => void} */
    let resolveInFlight = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInFlight = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // User A starts an in-flight cached GET request
    const inFlightPromise = client.get('/me/saved-items', {
      cacheKey: 'saved-items',
    });

    // User A logs out and User B logs in while request is still in-flight
    setIdentityKey('user-B');
    expect(getPrivateCache('personal-notes')).toBeUndefined();

    // Now User A's in-flight response arrives
    resolveInFlight(
      new Response(
        JSON.stringify({
          data: { items: ['user-A-secret-item'] },
          meta: { requestId: 'stale-req' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await inFlightPromise;
    // Cache must NOT contain User A's response under User B's session
    expect(getPrivateCache('saved-items')).toBeUndefined();
  });

  it('rejects 200 responses with malformed JSON and preserves requestId and idempotencyKey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{broken', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': 'req-malformed-json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.post(
        '/me/saved-items',
        { knowledgeVersionId: 'kv1' },
        { skipCsrf: true, idempotencyKey: 'idem-malformed-1' },
      ),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(200);
      expect(err.code).toBe('INVALID_RESPONSE');
      expect(err.meta.requestId).toBe('req-malformed-json');
      expect(err.idempotencyKey).toBe('idem-malformed-1');
      return true;
    });
  });

  it('rejects 200 responses with text/html Content-Type and preserves requestId and idempotencyKey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!doctype html><html><body>Gateway HTML</body></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Request-Id': 'req-html-200',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.post(
        '/me/saved-items',
        { knowledgeVersionId: 'kv2' },
        { skipCsrf: true, idempotencyKey: 'idem-html-2' },
      ),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(200);
      expect(err.code).toBe('INVALID_RESPONSE');
      expect(err.meta.requestId).toBe('req-html-200');
      expect(err.idempotencyKey).toBe('idem-html-2');
      return true;
    });
  });
});
