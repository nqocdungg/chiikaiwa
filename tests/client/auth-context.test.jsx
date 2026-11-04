import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { AuthProvider } from '../../client/src/features/auth/AuthContext.jsx';
import { useAuth } from '../../client/src/features/auth/use-auth.js';
import { api } from '../../client/src/services/api-client.js';
import { ApiError } from '../../client/src/services/errors.js';
import {
  getIdentityEpoch,
  getPrivateCache,
  setPrivateCache,
} from '../../client/src/services/cache.js';

describe('AuthContext and Identity lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fetches /auth/me on mount and populates active learner state', async () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      email: 'learner@chiikaiwa.com',
      displayName: 'Hạnh Nhi',
      avatarKey: 'tanuki',
      role: 'learner',
      version: 1,
      status: 'active',
    };

    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: { kind: 'user', user: mockUser },
      meta: { requestId: 'req-1' },
      epoch: getIdentityEpoch(),
    }));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.kind).toBe('user');
    expect(result.current.role).toBe('learner');
    expect(result.current.status).toBe('active');
    expect(result.current.user).toEqual(mockUser);
  });

  it('handles 401 AUTH_REQUIRED as unauthenticated and clears private cache', async () => {
    setPrivateCache('my-draft', 'draft data');
    expect(getPrivateCache('my-draft')).toBe('draft data');

    vi.spyOn(api, 'get').mockRejectedValueOnce(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Yêu cầu đăng nhập.',
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBe('anonymous');
    expect(getPrivateCache('my-draft')).toBeUndefined();
  });

  it('login updates user identity and clears previous cache', async () => {
    setPrivateCache('prev-user-cache', 'stale');

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        user: {
          id: 'u-new',
          email: 'new@chiikaiwa.com',
          displayName: 'New User',
          role: 'learner',
          status: 'active',
          version: 1,
        },
        expiresAt: '2026-11-11T00:00:00.000Z',
      },
      meta: { requestId: 'login-req' },
      epoch: 1,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    expect(result.current.kind).toBe('unauthenticated');

    await act(async () => {
      await result.current.login({
        email: 'new@chiikaiwa.com',
        password: 'password123',
      });
    });

    expect(result.current.kind).toBe('user');
    expect(result.current.user?.id).toBe('u-new');
    expect(getPrivateCache('prev-user-cache')).toBeUndefined();
  });

  it('logout revokes session on server, resets local state, and purges cache', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: null,
      meta: { requestId: 'logout-req' },
      epoch: 2,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(postSpy).toHaveBeenCalledWith('/auth/logout', {});
    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('ignores stale /auth/me response that resolves after logout or identity change', async () => {
    /** @type {(val: any) => void} */
    let resolveMe = () => {};
    const startEpoch = getIdentityEpoch();
    vi.spyOn(api, 'get').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMe = resolve;
        }),
    );
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: null,
      meta: { requestId: 'logout-req' },
      epoch: startEpoch + 1,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    // Trigger logout while initial /auth/me is still in-flight
    await act(async () => {
      await result.current.logout();
    });

    // Now the stale /auth/me from before logout resolves with old user data
    await act(async () => {
      resolveMe({
        data: {
          kind: 'user',
          user: {
            id: 'old-user',
            email: 'old@chiikaiwa.com',
            displayName: 'Old',
            role: 'learner',
            status: 'active',
            version: 1,
          },
        },
        meta: { requestId: 'stale-me' },
        epoch: startEpoch,
      });
      await Promise.resolve();
    });

    // Must remain unauthenticated and NOT restore old-user
    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('register calls API without automatically logging in', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        user: {
          id: 'u-reg',
          email: 'reg@chiikaiwa.com',
          displayName: 'Reg',
          role: 'learner',
          version: 1,
        },
      },
      meta: { requestId: 'reg-req' },
      epoch: 1,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    /** @type {import('../../client/src/features/auth/auth-context.js').SelfUser | undefined} */
    let registeredUser;
    await act(async () => {
      registeredUser = await result.current.register({
        email: 'reg@chiikaiwa.com',
        password: 'password123',
        displayName: 'Reg',
      });
    });

    expect(postSpy).toHaveBeenCalledWith('/auth/register', {
      email: 'reg@chiikaiwa.com',
      password: 'password123',
      displayName: 'Reg',
    });
    expect(registeredUser?.id).toBe('u-reg');
    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('clears isLoading to false when refreshSession receives 401 SESSION_EXPIRED from an active session', async () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      email: 'learner@chiikaiwa.com',
      displayName: 'Hạnh Nhi',
      role: 'learner',
      version: 1,
      status: 'active',
    };

    vi.spyOn(api, 'get')
      .mockImplementationOnce(async () => ({
        data: { kind: 'user', user: mockUser },
        meta: { requestId: 'req-init' },
        epoch: getIdentityEpoch(),
      }))
      .mockRejectedValueOnce(
        new ApiError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Phiên đăng nhập đã hết hạn.',
        }),
      );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.kind).toBe('user');
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.refreshSession();
    });

    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('handles overlapping refreshSession calls without restoring stale user or sticking isLoading', async () => {
    /** @type {(val: any) => void} */
    let resolveFirst = () => {};
    /** @type {(err: any) => void} */
    let rejectSecond = () => {};

    const firstStartEpoch = getIdentityEpoch();
    vi.spyOn(api, 'get')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSecond = reject;
          }),
      );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    /** @type {Promise<void>} */
    let p1;
    /** @type {Promise<void>} */
    let p2;
    act(() => {
      p1 = result.current.refreshSession();
      p2 = result.current.refreshSession();
    });

    expect(result.current.isLoading).toBe(true);

    // First (superseded) request resolves first -> must NOT end loading or set stale user
    await act(async () => {
      resolveFirst({
        data: {
          kind: 'user',
          user: {
            id: 'stale-u',
            email: 'stale@chiikaiwa.com',
            displayName: 'Stale',
            role: 'learner',
            status: 'active',
            version: 1,
          },
        },
        meta: { requestId: 'req-stale' },
        epoch: firstStartEpoch,
      });
      await p1;
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();

    // Second (latest) request rejects with 401 -> must set unauthenticated and end loading
    await act(async () => {
      rejectSecond(
        new ApiError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Expired',
        }),
      );
      await p2;
    });

    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces server/network/CSRF errors on logout without faking server revocation or auto-retrying', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'user',
        user: {
          id: 'u-active',
          email: 'active@chiikaiwa.com',
          displayName: 'Active',
          role: 'learner',
          status: 'active',
          version: 1,
        },
      },
      meta: { requestId: 'me-active' },
      epoch: getIdentityEpoch(),
    }));

    const postSpy = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Tạm thời gián đoạn.',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Mất kết nối mạng.',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 403,
          code: 'CSRF_INVALID',
          message: 'CSRF không hợp lệ.',
        }),
      );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.kind).toBe('user');
    setPrivateCache('sensitive-key', { secret: true });

    // 1. 503 SERVICE_UNAVAILABLE
    /** @type {ApiError | undefined} */
    let err503;
    await act(async () => {
      try {
        await result.current.logout();
      } catch (err) {
        err503 = /** @type {ApiError} */ (err);
      }
    });
    expect(err503).toBeInstanceOf(ApiError);
    expect(err503?.status).toBe(503);
    expect(result.current.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.current.kind).toBe('user');
    expect(result.current.isLoading).toBe(false);
    expect(getPrivateCache('sensitive-key')).toBeUndefined();

    // 2. Network error
    /** @type {ApiError | undefined} */
    let errNet;
    await act(async () => {
      try {
        await result.current.logout();
      } catch (err) {
        errNet = /** @type {ApiError} */ (err);
      }
    });
    expect(errNet?.code).toBe('NETWORK_ERROR');
    expect(result.current.kind).toBe('user');

    // 3. 403 CSRF_INVALID -> must not auto-retry
    /** @type {ApiError | undefined} */
    let errCsrf;
    await act(async () => {
      try {
        await result.current.logout();
      } catch (err) {
        errCsrf = /** @type {ApiError} */ (err);
      }
    });
    expect(errCsrf?.code).toBe('CSRF_INVALID');
    expect(postSpy).toHaveBeenCalledTimes(3);
  });

  it('does not restore user or resolve as success when a slow login finishes after logout succeeds', async () => {
    /** @type {(val: any) => void} */
    let resolveSlowLogin = () => {};

    vi.spyOn(api, 'post')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlowLogin = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: null,
        meta: { requestId: 'logout-ok' },
        epoch: getIdentityEpoch(),
      });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    /** @type {Promise<any>} */
    let slowLoginPromise;
    act(() => {
      slowLoginPromise = result.current.login({
        email: 'slow@chiikaiwa.com',
        password: 'password123',
      });
    });

    expect(result.current.isLoading).toBe(true);

    // Logout succeeds before slow login returns
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);

    // Now slow login returns -> must reject with AUTH_SUPERSEDED and NOT restore user
    /** @type {ApiError | undefined} */
    let slowLoginError;
    await act(async () => {
      resolveSlowLogin({
        data: {
          user: {
            id: 'u-slow',
            email: 'slow@chiikaiwa.com',
            displayName: 'Slow User',
            role: 'learner',
            status: 'active',
            version: 1,
          },
          expiresAt: '2026-11-11T00:00:00.000Z',
        },
        meta: { requestId: 'login-slow' },
        epoch: 1,
      });
      try {
        await slowLoginPromise;
      } catch (err) {
        slowLoginError = /** @type {ApiError} */ (err);
      }
    });

    expect(slowLoginError).toBeInstanceOf(ApiError);
    expect(slowLoginError?.code).toBe('AUTH_SUPERSEDED');
    expect(result.current.kind).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('does not clear new user or cache when a slow logout finishes after a newer login succeeds', async () => {
    /** @type {(val: any) => void} */
    let resolveSlowLogout = () => {};

    vi.spyOn(api, 'post')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlowLogout = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'u-fresh',
            email: 'fresh@chiikaiwa.com',
            displayName: 'Fresh User',
            role: 'learner',
            status: 'active',
            version: 1,
          },
          expiresAt: '2026-11-11T00:00:00.000Z',
        },
        meta: { requestId: 'login-fresh' },
        epoch: 2,
      });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    /** @type {Promise<void>} */
    let slowLogoutPromise;
    act(() => {
      slowLogoutPromise = result.current.logout();
    });

    // Newer login succeeds while slow logout is still in-flight
    await act(async () => {
      await result.current.login({
        email: 'fresh@chiikaiwa.com',
        password: 'password123',
      });
    });

    setPrivateCache('fresh-user-note', 'important-data');
    expect(result.current.kind).toBe('user');
    expect(result.current.user?.id).toBe('u-fresh');
    expect(result.current.isLoading).toBe(false);

    // Now the older slow logout returns 204 -> must reject with AUTH_SUPERSEDED and NOT wipe fresh user or cache
    /** @type {ApiError | undefined} */
    let slowLogoutError;
    await act(async () => {
      resolveSlowLogout({
        data: null,
        meta: { requestId: 'logout-slow' },
        epoch: 1,
      });
      try {
        await slowLogoutPromise;
      } catch (err) {
        slowLogoutError = /** @type {ApiError} */ (err);
      }
    });

    expect(slowLogoutError).toBeInstanceOf(ApiError);
    expect(slowLogoutError?.code).toBe('AUTH_SUPERSEDED');
    expect(result.current.kind).toBe('user');
    expect(result.current.user?.id).toBe('u-fresh');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getPrivateCache('fresh-user-note')).toBe('important-data');
  });

  it('does not overwrite newer error or state when an older auth request fails late', async () => {
    /** @type {(err: any) => void} */
    let rejectStaleLogout = () => {};
    /** @type {(err: any) => void} */
    let rejectStaleLogin = () => {};

    vi.spyOn(api, 'post')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectStaleLogout = reject;
          }),
      )
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'u-valid',
            email: 'valid@chiikaiwa.com',
            displayName: 'Valid User',
            role: 'learner',
            status: 'active',
            version: 1,
          },
          expiresAt: '2026-11-11T00:00:00.000Z',
        },
        meta: { requestId: 'login-valid' },
        epoch: 2,
      })
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectStaleLogin = reject;
          }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Máy chủ đang bảo trì.',
        }),
      );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider skipInitialCheck>{children}</AuthProvider>
      ),
    });

    // Case A: Stale logout fails after newer login succeeded -> must NOT set error or clear new user's cache
    /** @type {Promise<void>} */
    let pStaleLogout;
    act(() => {
      pStaleLogout = result.current.logout();
    });

    await act(async () => {
      await result.current.login({
        email: 'valid@chiikaiwa.com',
        password: 'password123',
      });
    });

    setPrivateCache('valid-cache', { ok: true });

    await act(async () => {
      rejectStaleLogout(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Stale logout failed',
        }),
      );
      try {
        await pStaleLogout;
      } catch {
        // expected rejection for stale caller
      }
    });

    expect(result.current.kind).toBe('user');
    expect(result.current.user?.id).toBe('u-valid');
    expect(result.current.error).toBeNull();
    expect(getPrivateCache('valid-cache')).toEqual({ ok: true });

    // Case B: Stale login fails with 401 after newer logout failed with 503 -> must NOT overwrite 503 error
    /** @type {Promise<any>} */
    let pStaleLogin;
    act(() => {
      pStaleLogin = result.current.login({
        email: 'wrong@chiikaiwa.com',
        password: 'wrong',
      });
    });

    await act(async () => {
      try {
        await result.current.logout();
      } catch {
        // expected 503
      }
    });

    expect(result.current.error?.code).toBe('SERVICE_UNAVAILABLE');

    await act(async () => {
      rejectStaleLogin(
        new ApiError({
          status: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Sai mật khẩu.',
        }),
      );
      try {
        await pStaleLogin;
      } catch {
        // expected rejection for stale caller
      }
    });

    // Newer error (SERVICE_UNAVAILABLE) must be preserved
    expect(result.current.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.current.isLoading).toBe(false);
  });
});
