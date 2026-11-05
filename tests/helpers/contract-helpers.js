import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';

export const ISO_8601_UTC_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Generates an RFC 4122 v4 UUID for Idempotency-Key testing.
 * @returns {string}
 */
export function createTestIdempotencyKey() {
  return randomUUID();
}

/**
 * Extracts a specific cookie value from a Supertest Set-Cookie header.
 * @param {string | string[] | undefined} setCookieHeader
 * @param {string} cookieName
 * @returns {string}
 */
export function extractSetCookieValue(setCookieHeader, cookieName) {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const item of list) {
    if (item.startsWith(`${cookieName}=`)) {
      const match = /^([^=]+)=([^;]*)/u.exec(item);
      return match ? match[2] : '';
    }
  }
  return '';
}

/**
 * Fetches CSRF token and its cookie header from the Express application.
 * @param {import('express').Express} app
 * @returns {Promise<{ csrfToken: string, csrfCookie: string, rawSetCookie: string | string[] }>}
 */
export async function fetchCsrfContext(app) {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  const csrfToken = res.body?.data?.csrfToken;
  const rawSetCookie = res.headers['set-cookie'];
  const cookiePair = extractSetCookieValue(rawSetCookie, 'ck_csrf');
  return {
    csrfToken,
    csrfCookie: `ck_csrf=${cookiePair}`,
    rawSetCookie,
  };
}

/**
 * Builds a valid Cookie header string from individual token parts.
 * @param {Object} tokens
 * @param {string} [tokens.authCookie]
 * @param {string} [tokens.guestCookie]
 * @param {string} [tokens.csrfCookie]
 * @returns {string}
 */
export function buildCookieHeader({
  authCookie,
  guestCookie,
  csrfCookie,
} = {}) {
  const parts = [];
  if (csrfCookie) {
    parts.push(
      csrfCookie.startsWith('ck_csrf=') ? csrfCookie : `ck_csrf=${csrfCookie}`,
    );
  }
  if (authCookie) {
    parts.push(
      authCookie.startsWith('ck_session=')
        ? authCookie
        : `ck_session=${authCookie}`,
    );
  }
  if (guestCookie) {
    parts.push(
      guestCookie.startsWith('ck_guest=')
        ? guestCookie
        : `ck_guest=${guestCookie}`,
    );
  }
  return parts.join('; ');
}

/**
 * Verifies that a response strictly adheres to the Chiikaiwa Success Envelope (07 §1).
 *
 * Requirements:
 * - Status code matches expectedStatus
 * - Body contains `{ data, meta: { requestId, serverTime } }`
 * - Meta requestId matches X-Request-Id response header
 * - Meta serverTime is ISO 8601 UTC
 * - Cache-Control is 'no-store'
 * - X-Powered-By is omitted
 *
 * @param {any} response Supertest response
 * @param {{ expectedStatus?: number }} [options]
 */
export function assertSuccessEnvelope(response, { expectedStatus = 200 } = {}) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toBeTypeOf('object');
  expect(response.body).not.toBeNull();
  expect(response.body).toHaveProperty('data');
  expect(response.body).toHaveProperty('meta');

  const meta = response.body.meta;
  expect(meta).toBeTypeOf('object');
  expect(meta.requestId).toBeDefined();
  expect(response.headers['x-request-id']).toBe(meta.requestId);
  expect(meta.serverTime).toMatch(ISO_8601_UTC_REGEX);

  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-powered-by']).toBeUndefined();
  assertNoSensitiveLeaks(response);
}

/**
 * Verifies that a response is a valid 204 No Content per 07 §1 (no body).
 * @param {any} response
 */
export function assertNoContentEnvelope(response) {
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-powered-by']).toBeUndefined();
}

/**
 * Verifies that a response strictly adheres to the Chiikaiwa Error Envelope (07 §1, §12).
 *
 * @param {any} response
 * @param {Object} options
 * @param {number} options.expectedStatus
 * @param {string} options.expectedCode
 * @param {string} [options.expectedMessageSnippet]
 */
export function assertErrorEnvelope(
  response,
  { expectedStatus, expectedCode, expectedMessageSnippet },
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toBeTypeOf('object');
  expect(response.body).not.toBeNull();
  expect(response.body).toHaveProperty('error');
  expect(response.body).toHaveProperty('meta');

  const error = response.body.error;
  expect(error).toBeTypeOf('object');
  expect(error.code).toBe(expectedCode);
  expect(error.message).toBeTypeOf('string');
  if (expectedMessageSnippet) {
    expect(error.message).toContain(expectedMessageSnippet);
  }

  const meta = response.body.meta;
  expect(meta).toBeTypeOf('object');
  expect(meta.requestId).toBeDefined();
  expect(response.headers['x-request-id']).toBe(meta.requestId);
  expect(meta.serverTime).toMatch(ISO_8601_UTC_REGEX);

  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-powered-by']).toBeUndefined();
  assertNoSensitiveLeaks(response);
}

/**
 * Verifies 422 VALIDATION_FAILED error envelope with field details (07 §12).
 * @param {any} response
 * @param {Array<{ path: string, code?: string }>} [expectedFields]
 */
export function assertValidationError(response, expectedFields = []) {
  assertErrorEnvelope(response, {
    expectedStatus: 422,
    expectedCode: 'VALIDATION_FAILED',
  });
  const details = response.body.error.details;
  expect(details).toBeTypeOf('object');
  expect(Array.isArray(details.fields)).toBe(true);

  for (const expected of expectedFields) {
    const match = details.fields.find(
      /** @param {{ path: string, code?: string }} f */
      (f) =>
        f.path === expected.path &&
        (expected.code === undefined || f.code === expected.code),
    );
    expect(
      match,
      `Expected validation error on field "${expected.path}" with code "${expected.code ?? '*'}"`,
    ).toBeDefined();
  }
}

/**
 * Verifies 409 VERSION_CONFLICT error envelope with currentVersion details (07 §1, §12).
 * @param {any} response
 * @param {{ expectedCurrentVersion?: number }} [options]
 */
export function assertVersionConflict(
  response,
  { expectedCurrentVersion } = {},
) {
  assertErrorEnvelope(response, {
    expectedStatus: 409,
    expectedCode: 'VERSION_CONFLICT',
  });
  if (expectedCurrentVersion !== undefined) {
    expect(response.body.error.details?.currentVersion).toBe(
      expectedCurrentVersion,
    );
  }
}

/**
 * Asserts that the response text does not leak internal implementation details,
 * connection URIs, password hashes, or stack traces (07 §1, NFR-07).
 * @param {any} response
 */
export function assertNoSensitiveLeaks(response) {
  const rawText = String(response.text ?? '');
  expect(rawText).not.toContain('mongodb://');
  expect(rawText).not.toContain('mongodb+srv://');
  expect(rawText).not.toContain('scrypt$');
  expect(rawText).not.toContain('node_modules');
  expect(rawText).not.toContain('at Function.');
  expect(rawText).not.toContain('at Object.');
  expect(rawText).not.toContain('at process.');
}
