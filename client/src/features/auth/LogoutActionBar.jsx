import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { mapAuthApiError } from './auth-validation.js';
import { useAuth } from './use-auth.js';

export function LogoutActionBar() {
  const { kind, user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(
    /** @type {string | null} */ (null),
  );
  const pendingRef = useRef(false);

  if (kind !== 'user' && kind !== 'guest') {
    return null;
  }

  const actorLabel =
    kind === 'user'
      ? user?.displayName || user?.email || 'Người học'
      : 'Khách dùng thử';

  const handleLogout = async () => {
    if (pendingRef.current || isLoggingOut) {
      return;
    }
    pendingRef.current = true;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      const errCode = /** @type {{code?: string}} */ (err)?.code;
      if (errCode === 'AUTH_SUPERSEDED') {
        return;
      }
      const mapped = mapAuthApiError(err, 'logout');
      setLogoutError(mapped.bannerMessage);
    } finally {
      pendingRef.current = false;
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="ck-session-bar" data-testid="auth-session-bar">
      <div className="ck-session-bar__inner">
        <div className="ck-session-bar__identity">
          <span className="ck-session-bar__badge">
            {role === 'admin'
              ? 'Admin'
              : kind === 'guest'
                ? 'Khách'
                : 'Học viên'}
          </span>
          <span className="ck-session-bar__name">{actorLabel}</span>
        </div>

        <div className="ck-session-bar__actions">
          {kind === 'user' && role !== 'admin' ? (
            <Link to="/profile" className="ck-session-bar__link">
              Hồ sơ
            </Link>
          ) : null}
          <button
            type="button"
            className="ck-session-bar__logout-btn"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          </button>
        </div>
      </div>

      {logoutError ? (
        <div
          className="ck-session-bar__error"
          role="alert"
          aria-live="assertive"
        >
          <span>{logoutError}</span>
        </div>
      ) : null}
    </div>
  );
}
