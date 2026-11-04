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
});
