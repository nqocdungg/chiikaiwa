import { useEffect, useRef, useState } from 'react';

/** @param {number} seconds */
function formatRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Displays a server-derived deadline without treating the browser timer as an
 * authorization decision.
 *
 * @param {{expiresAt: string, serverTime?: string, prefix?: string, className?: string, onExpire?: () => void}} props
 */
export function Countdown({
  expiresAt,
  serverTime,
  prefix = 'Còn',
  className = '',
  onExpire,
}) {
  const [remaining, setRemaining] = useState(
    /** @type {number | null} */ (null),
  );
  const notifiedExpiryRef = useRef('');

  useEffect(() => {
    const expiry = Date.parse(expiresAt);
    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN;
    const offset = Number.isFinite(parsedServerTime)
      ? parsedServerTime - Date.now()
      : 0;
    const tick = () => {
      setRemaining(
        Number.isFinite(expiry)
          ? Math.max(0, Math.ceil((expiry - (Date.now() + offset)) / 1000))
          : 0,
      );
    };
    const firstTick = globalThis.setTimeout(tick, 0);
    const timer = globalThis.setInterval(tick, 1000);
    return () => {
      globalThis.clearTimeout(firstTick);
      globalThis.clearInterval(timer);
    };
  }, [expiresAt, serverTime]);

  useEffect(() => {
    if (
      remaining !== null &&
      remaining === 0 &&
      onExpire &&
      notifiedExpiryRef.current !== expiresAt
    ) {
      notifiedExpiryRef.current = expiresAt;
      onExpire();
    }
  }, [expiresAt, onExpire, remaining]);

  const label = `${prefix} ${remaining === null ? '--:--' : formatRemaining(remaining)}`;
  return (
    <span className={className} role="timer" aria-label={label}>
      {label}
    </span>
  );
}
