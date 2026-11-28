import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/use-auth.js';
import { handleQuizLifecycleError } from './quiz-api.js';

/**
 * Provides a referentially stable handler for 410/401/403 lifecycle transitions
 * so async fetch/submit effects do not abort or reset when AuthContext updates.
 */
export function useQuizLifecycle() {
  const navigate = useNavigate();
  const { invalidateSession, updateUser } = useAuth();
  const ctxRef = useRef({ navigate, invalidateSession, updateUser });

  useEffect(() => {
    ctxRef.current = { navigate, invalidateSession, updateUser };
  }, [invalidateSession, navigate, updateUser]);

  /** @type {(err: unknown, onBeforeNavigate?: () => void) => boolean} */
  const handleLifecycle = useCallback((err, onBeforeNavigate) => {
    const {
      navigate: nav,
      invalidateSession: inv,
      updateUser: upd,
    } = ctxRef.current;
    return handleQuizLifecycleError(err, {
      auth: { invalidateSession: inv, updateUser: upd },
      navigate: nav,
      onBeforeNavigate,
    });
  }, []);

  return handleLifecycle;
}
