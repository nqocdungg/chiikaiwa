import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { useAuth } from '../features/auth/use-auth.js';
import { api } from '../services/api-client.js';
import { getIdentityEpoch } from '../services/cache.js';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/u;

/**
 * Route guard that restricts access based on authentication state and allowed identity roles.
 *
 * Role mapping according to 07 §2.1:
 * - 'U': Active user (learner or admin)
 * - 'G': Active guest trial
 * - 'A': Active admin
 *
 * Note: Session membership ('M') is NOT granted by identity alone; use SessionMemberRoute
 * so that membership of a specific :sessionId is verified by the backend.
 *
 * @param {Object} props
 * @param {Array<'U' | 'G' | 'A'>} [props.allowedRoles]
 * @param {import('react').ReactNode} [props.children]
 */
export function ProtectedRoute({ allowedRoles = ['U'], children }) {
  const { kind, role, status, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-muted">Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  // Expired guest session -> redirect to SC-20 (/expired)
  if (status === 'expired') {
    return <Navigate to="/expired" replace />;
  }

  // Locked accounts are stopped immediately
  if (status === 'locked') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold text-ink">Tài khoản đã bị khóa</h1>
        <p className="mt-4 text-muted">
          Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ quản trị viên để
          được hỗ trợ.
        </p>
      </div>
    );
  }

  // Not logged in -> redirect to login
  if (kind === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role authorization
  let isAllowed = false;
  for (const allowed of allowedRoles) {
    if (allowed === 'U' && (role === 'learner' || role === 'admin')) {
      isAllowed = true;
      break;
    }
    if (allowed === 'G' && role === 'guest') {
      isAllowed = true;
      break;
    }
    if (allowed === 'A' && role === 'admin') {
      isAllowed = true;
      break;
    }
  }

  if (!isAllowed) {
    if (role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    if (role === 'learner') {
      return <Navigate to="/home" replace />;
    }
    if (role === 'guest') {
      return <Navigate to="/invitation" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Route guard for Session Member ('M') routes (07 §2.1 & §6).
 * Being logged in ('U') or having a guest identity ('G') is necessary but NOT sufficient
 * to prove membership in a specific session. Membership must be confirmed by the backend
 * via GET /sessions/:sessionId.
 *
 * @param {Object} props
 * @param {import('react').ReactNode} [props.children]
 */
export function SessionMemberRoute({ children }) {
  const { kind, role, status, guest, isLoading } = useAuth();
  const { sessionId } = useParams();
  const location = useLocation();
  const [verification, setVerification] = useState(
    /** @type {{ sessionId: string | null, status: 'pending' | 'verified' | 'unauthenticated' | 'denied' }} */ ({
      sessionId: null,
      status: 'pending',
    }),
  );

  const hasValidIdentity =
    !isLoading &&
    status === 'active' &&
    (role === 'learner' || role === 'admin' || role === 'guest');
  const isValidSessionId = Boolean(
    sessionId && OBJECT_ID_REGEX.test(sessionId),
  );
  const isGuestSessionMismatch =
    kind === 'guest' &&
    Boolean(guest?.sessionId) &&
    guest?.sessionId !== sessionId;

  useEffect(() => {
    if (
      !hasValidIdentity ||
      !isValidSessionId ||
      isGuestSessionMismatch ||
      !sessionId
    ) {
      return;
    }

    let cancelled = false;
    const startEpoch = getIdentityEpoch();

    (async () => {
      try {
        const res = await api.get(`/sessions/${encodeURIComponent(sessionId)}`);
        if (
          cancelled ||
          res.epoch !== getIdentityEpoch() ||
          startEpoch !== getIdentityEpoch()
        ) {
          return;
        }
        setVerification({ sessionId, status: 'verified' });
      } catch (err) {
        if (cancelled || startEpoch !== getIdentityEpoch()) {
          return;
        }
        const errStatus = /** @type {{ status?: number }} */ (err)?.status;
        if (errStatus === 401) {
          setVerification({ sessionId, status: 'unauthenticated' });
        } else {
          setVerification({ sessionId, status: 'denied' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasValidIdentity, isGuestSessionMismatch, isValidSessionId, sessionId]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-muted">Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  if (status === 'expired') {
    return <Navigate to="/expired" replace />;
  }

  if (status === 'locked') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold text-ink">Tài khoản đã bị khóa</h1>
        <p className="mt-4 text-muted">
          Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ quản trị viên để
          được hỗ trợ.
        </p>
      </div>
    );
  }

  if (kind === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isValidSessionId || isGuestSessionMismatch) {
    return <Navigate to="/expired" replace />;
  }

  if (
    verification.sessionId !== sessionId ||
    verification.status === 'pending'
  ) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-muted">
          Đang xác thực quyền thành viên phiên...
        </span>
      </div>
    );
  }

  if (verification.status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (verification.status !== 'verified') {
    return <Navigate to="/expired" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Route guard that redirects already logged-in users away from guest/auth routes (e.g. login, register).
 *
 * @param {Object} props
 * @param {import('react').ReactNode} [props.children]
 */
export function PublicOnlyRoute({ children }) {
  const { kind, role, status, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-muted">Đang tải...</span>
      </div>
    );
  }

  if (kind === 'user' && status !== 'locked') {
    const rawFrom = /** @type {{from?: {pathname?: string}}} */ (location.state)
      ?.from?.pathname;
    if (role === 'admin') {
      const target =
        rawFrom && rawFrom.startsWith('/admin') ? rawFrom : '/admin';
      return <Navigate to={target} replace />;
    }
    const target = rawFrom && !rawFrom.startsWith('/admin') ? rawFrom : '/home';
    return <Navigate to={target} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
