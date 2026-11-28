import { useCallback, useEffect, useRef } from 'react';

const MARKER = 'ckQuizLeaveGuard';

/**
 * @param {{ active: boolean, onBlocked: () => void }} props
 */
export function useQuizLeaveGuard({ active, onBlocked }) {
  const blockedRef = useRef(onBlocked);
  const releasedRef = useRef(false);

  useEffect(() => {
    blockedRef.current = onBlocked;
  }, [onBlocked]);

  useEffect(() => {
    releasedRef.current = false;
    if (!active) return undefined;

    /** @param {BeforeUnloadEvent} event */
    const warnBeforeUnload = (event) => {
      if (releasedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const pushMarker = () =>
      window.history.pushState(
        { ...(window.history.state ?? {}), [MARKER]: true },
        '',
      );

    const interceptBack = () => {
      if (releasedRef.current || window.history.state?.[MARKER]) return;
      pushMarker();
      blockedRef.current();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    pushMarker();
    window.addEventListener('popstate', interceptBack);

    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('popstate', interceptBack);
    };
  }, [active]);

  return useCallback(() => {
    releasedRef.current = true;
  }, []);
}
