import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api-client.js';
import {
  clearPrivateCache,
  getIdentityEpoch,
  setIdentityKey,
} from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { AuthContext } from './auth-context.js';

/**
 * @typedef {import('./auth-context.js').SelfUser} SelfUser
 * @typedef {import('./auth-context.js').GuestSession} GuestSession
 * @typedef {import('./auth-context.js').AuthState} AuthState
 */

/**
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 * @param {boolean} [props.skipInitialCheck] For unit testing
 */
export function AuthProvider({ children, skipInitialCheck = false }) {
  const [user, setUser] = useState(/** @type {SelfUser | null} */ (null));
  const [guest, setGuest] = useState(/** @type {GuestSession | null} */ (null));
  const [kind, setKind] = useState(
    /** @type {'user' | 'guest' | 'unauthenticated'} */ ('unauthenticated'),
  );
  const [role, setRole] = useState(
    /** @type {'learner' | 'admin' | 'guest' | 'anonymous'} */ ('anonymous'),
  );
  const [status, setStatus] = useState(
    /** @type {'active' | 'locked' | 'expired' | null} */ (null),
  );
  const [isLoading, setIsLoading] = useState(!skipInitialCheck);
  const [error, setError] = useState(/** @type {ApiError | null} */ (null));
  const authRequestSeqRef = useRef(0);

  const resetState = useCallback(() => {
    setUser(null);
    setGuest(null);
    setKind('unauthenticated');
    setRole('anonymous');
    setStatus(null);
    api.setCsrfToken(null);
    setIdentityKey(null);
    clearPrivateCache();
  }, []);

  const applyMeResponse = useCallback(
    (
      /** @type {{kind?: string, user?: SelfUser, guest?: GuestSession}} */ data,
      /** @type {number | undefined} */ responseEpoch,
    ) => {
      if (responseEpoch !== undefined && responseEpoch !== getIdentityEpoch()) {
        return;
      }
      if (data?.kind === 'user' && data.user) {
        setUser(data.user);
        setGuest(null);
        setKind('user');
        setRole(data.user.role ?? 'learner');
        setStatus(data.user.status ?? 'active');
        setIdentityKey(data.user.id);
      } else if (data?.kind === 'guest' && data.guest) {
        if (data.guest.status === 'expired') {
          setUser(null);
          setGuest(data.guest);
          setKind('guest');
          setRole('guest');
          setStatus('expired');
          setIdentityKey(null);
          clearPrivateCache();
          return;
        }
        setGuest(data.guest);
        setUser(null);
        setKind('guest');
        setRole('guest');
        setStatus('active');
        setIdentityKey(data.guest.sessionId ?? 'guest');
      } else {
        resetState();
      }
    },
    [resetState],
  );

  const handleMeError = useCallback(
    (
      /** @type {unknown} */ err,
      /** @type {number | undefined} */ startEpoch,
    ) => {
      if (startEpoch !== undefined && startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (err instanceof ApiError) {
        if (err.isAuthRequired()) {
          resetState();
        } else if (err.isGuestExpired()) {
          setUser(null);
          setGuest(null);
          setKind('guest');
          setRole('guest');
          setStatus('expired');
          setIdentityKey(null);
          clearPrivateCache();
          setError(err);
        } else if (err.code === 'ACCOUNT_LOCKED') {
          setStatus('locked');
          setError(err);
        } else {
          setError(err);
        }
      } else {
        resetState();
      }
    },
    [resetState],
  );

  const checkAuth = useCallback(async () => {
    const requestSeq = ++authRequestSeqRef.current;
    const startEpoch = getIdentityEpoch();
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/auth/me');
      if (requestSeq !== authRequestSeqRef.current) {
        return;
      }
      const data =
        /** @type {{kind?: string, user?: SelfUser, guest?: GuestSession}} */ (
          res.data
        );
      applyMeResponse(data, res.epoch ?? startEpoch);
    } catch (err) {
      if (requestSeq !== authRequestSeqRef.current) {
        return;
      }
      handleMeError(err, startEpoch);
    } finally {
      if (requestSeq === authRequestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [applyMeResponse, handleMeError]);

  useEffect(() => {
    if (skipInitialCheck) {
      return;
    }
    let isMounted = true;
    const requestSeq = ++authRequestSeqRef.current;
    const startEpoch = getIdentityEpoch();
    api
      .get('/auth/me')
      .then((res) => {
        if (!isMounted || requestSeq !== authRequestSeqRef.current) return;
        const data =
          /** @type {{kind?: string, user?: SelfUser, guest?: GuestSession}} */ (
            res.data
          );
        applyMeResponse(data, res.epoch ?? startEpoch);
      })
      .catch((err) => {
        if (!isMounted || requestSeq !== authRequestSeqRef.current) return;
        handleMeError(err, startEpoch);
      })
      .finally(() => {
        if (isMounted && requestSeq === authRequestSeqRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [applyMeResponse, handleMeError, skipInitialCheck]);

  const login = useCallback(
    /** @param {{email: string, password: string}} credentials */
    async (credentials) => {
      const requestSeq = ++authRequestSeqRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.post('/auth/login', credentials);
        const data = /** @type {{user: SelfUser, expiresAt: string}} */ (
          res.data
        );
        const loggedInUser = data.user;
        api.setCsrfToken(null);
        setIdentityKey(loggedInUser.id);
        setUser(loggedInUser);
        setGuest(null);
        setKind('user');
        setRole(loggedInUser.role ?? 'learner');
        setStatus(loggedInUser.status ?? 'active');
        return loggedInUser;
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError({
                status: 500,
                code: 'INTERNAL_ERROR',
                message: 'Đăng nhập không thành công.',
              });
        setError(apiErr);
        throw apiErr;
      } finally {
        if (requestSeq === authRequestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const requestSeq = ++authRequestSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      await api.post('/auth/logout', {});
      resetState();
    } catch (err) {
      clearPrivateCache();
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError({
              status: 500,
              code: 'INTERNAL_ERROR',
              message: 'Đăng xuất không thành công.',
            });
      setError(apiErr);
      throw apiErr;
    } finally {
      if (requestSeq === authRequestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [resetState]);

  const register = useCallback(
    /** @param {{email: string, password: string, displayName: string}} payload */
    async (payload) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.post('/auth/register', payload);
        const data = /** @type {{user: SelfUser}} */ (res.data);
        return data.user;
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError({
                status: 500,
                code: 'INTERNAL_ERROR',
                message: 'Đăng ký không thành công.',
              });
        setError(apiErr);
        throw apiErr;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const updateUser = useCallback(
    /** @param {Partial<SelfUser>} partial */
    (partial) => {
      setUser((prev) => (prev ? { ...prev, ...partial } : prev));
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      guest,
      kind,
      role,
      status,
      isLoading,
      error,
      checkAuth,
      login,
      logout,
      register,
      updateUser,
      refreshSession: checkAuth,
    }),
    [
      user,
      guest,
      kind,
      role,
      status,
      isLoading,
      error,
      checkAuth,
      login,
      logout,
      register,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
