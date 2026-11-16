import { describe, expect, it } from 'vitest';
import { AppError } from '../../server/middleware/http-error.js';
import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  clearGuestSessionCookie,
  setAuthSessionCookie,
  setGuestSessionCookie,
} from '../../server/middleware/cookies.js';
import {
  generateGuestCredential,
  hashGuestCredential,
} from '../../server/modules/identity/crypto.js';
import {
  validateCreateGuestTrialInput,
  validateIdempotencyKey,
} from '../../server/modules/invitations/invitation-validation.js';

/**
 * @param {() => unknown} action
 * @param {{status: number, code: string, details?: Record<string, unknown>}} expected
 */
function expectAppError(action, expected) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(expected);
    return;
  }
  throw new Error('Expected an AppError');
}

/** @returns {{ values: string[], response: any }} */
function fakeResponse() {
  /** @type {string[]} */
  const values = [];
  return {
    values,
    response: {
      /** @param {string} _header @param {string} value */
      append(_header, value) {
        values.push(value);
      },
    },
  };
}

describe('BE-015 guest credential primitives', () => {
  it('generates distinct 32-byte base64url credentials', () => {
    const first = generateGuestCredential();
    const second = generateGuestCredential();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('hashes the raw credential without keeping it in the stored value', () => {
    const raw = generateGuestCredential();
    const hash = hashGuestCredential(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain(raw);
    expect(hashGuestCredential(raw)).toBe(hash);
  });
});

describe('BE-015 guest session cookie serializer', () => {
  it('sets ck_guest with HttpOnly, SameSite=Lax, Path=/ and no domain or expiry', () => {
    const { values, response } = fakeResponse();
    setGuestSessionCookie(response, 'raw-guest-credential', { secure: false });
    expect(values).toHaveLength(1);
    const cookie = values[0];
    expect(cookie.startsWith(`${GUEST_COOKIE_NAME}=raw-guest-credential`)).toBe(
      true,
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain('Max-Age=');
    expect(cookie).not.toContain('Expires=');
    expect(cookie).not.toContain('Secure');
  });

  it('adds Secure when secure cookies are configured', () => {
    const { values, response } = fakeResponse();
    setGuestSessionCookie(response, 'raw-guest-credential', { secure: true });
    expect(values[0]).toContain('Secure');
  });

  it('keeps the auth session cookie and guest cookie clearing behavior unchanged', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const auth = fakeResponse();
    setAuthSessionCookie(auth.response, 'jwt-token', expiresAt, {
      secure: true,
      now: new Date(),
    });
    expect(auth.values).toHaveLength(1);
    expect(auth.values[0].startsWith(`${AUTH_COOKIE_NAME}=jwt-token`)).toBe(
      true,
    );
    expect(auth.values[0]).toContain('Max-Age=');
    expect(auth.values[0]).toContain('Secure');
    expect(auth.values[0]).toContain('HttpOnly');
    expect(auth.values[0]).toContain('SameSite=Lax');
    expect(auth.values[0]).toContain('Path=/');
    expect(auth.values[0]).not.toContain('Domain=');

    const cleared = fakeResponse();
    clearGuestSessionCookie(cleared.response, { secure: true });
    expect(cleared.values).toHaveLength(1);
    expect(cleared.values[0].startsWith(`${GUEST_COOKIE_NAME}=`)).toBe(true);
    expect(cleared.values[0]).toContain('Max-Age=0');
    expect(cleared.values[0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared.values[0]).toContain('Secure');
  });
});

describe('BE-015 guest trial validation', () => {
  it('normalizes a valid invitation code', () => {
    expect(validateCreateGuestTrialInput({ code: ' abcd234567 ' })).toEqual({
      code: 'ABCD234567',
    });
  });

  it('rejects missing, mistyped, ambiguous or wrongly sized codes', () => {
    for (const body of [
      {},
      { code: 123 },
      { code: 'ABCDI23456' },
      { code: 'ABCD23456' },
      { code: 'ABCD2345678' },
    ]) {
      expectAppError(() => validateCreateGuestTrialInput(body), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }
  });

  it('rejects null bodies, arrays and unknown fields', () => {
    expectAppError(() => validateCreateGuestTrialInput(null), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expectAppError(() => validateCreateGuestTrialInput([]), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expectAppError(
      () => validateCreateGuestTrialInput({ code: 'ABCD234567', role: 'host' }),
      {
        status: 422,
        code: 'VALIDATION_FAILED',
        details: {
          fields: [
            expect.objectContaining({ path: 'role', code: 'UNKNOWN_FIELD' }),
          ],
        },
      },
    );
  });

  it('rejects missing or malformed Idempotency-Key values', () => {
    for (const value of [undefined, null, '', 'not-a-uuid']) {
      expectAppError(() => validateIdempotencyKey(value), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }
    expect(validateIdempotencyKey('4f63d5d0-d68a-4704-81a3-2833f534e532')).toBe(
      '4f63d5d0-d68a-4704-81a3-2833f534e532',
    );
  });
});
