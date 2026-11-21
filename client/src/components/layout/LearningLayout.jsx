import { useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../features/auth/use-auth.js';
import { activeLocationRef } from '../../features/home/navigation-tracker.js';
import { useHomeCoordination } from '../../features/home/use-home-coordination.js';
import { Button } from '../ui/controls.jsx';
import { Card } from '../ui/surfaces.jsx';
import { LearningHeader } from './LearningHeader.jsx';

/** @param {HTMLButtonElement | null} button */
function focusLogoutRetry(button) {
  button?.focus();
}

export function LearningLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const { kind, role, status, logout } = useAuth();
  const active =
    status === 'active' && (role === 'learner' || kind === 'guest');
  const isHome = /^\/home\/?$/iu.test(pathname);
  const coordination = useHomeCoordination(active && isHome);
  const [previousLocation, setPreviousLocation] = useState(location);
  const [logoutNotice, setLogoutNotice] = useState(false);
  const logoutInFlight = useRef(false);
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

  if (location !== previousLocation) {
    setPreviousLocation(location);
    setLogoutNotice(false);
  }

  const handleLogout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    const originKey = location.key;
    let logoutSuccess = false;
    try {
      await logout();
      logoutSuccess = true;
    } catch (err) {
      const errorObj = /** @type {{ code?: string } | null} */ (
        err && typeof err === 'object' ? err : null
      );
      if (errorObj?.code === 'AUTH_SUPERSEDED') {
        return;
      }
      // Nếu người dùng đã điều hướng sang trang khác trong lúc chờ logout
      const currentLoc = activeLocationRef.current;
      if (
        currentLoc &&
        (currentLoc.key !== originKey || currentLoc.pathname !== pathname)
      ) {
        return;
      }
      setLogoutNotice(true);
    } finally {
      logoutInFlight.current = false;
    }

    if (logoutSuccess) {
      const currentLoc = activeLocationRef.current;
      if (!currentLoc || currentLoc.key === originKey) {
        navigate('/login', { replace: true });
      }
    }
  };

  return (
    <>
      {active && (
        <LearningHeader
          isHome={isHome}
          practiceDisabled={coordination.isStartDisabled}
          triggerRef={triggerRef}
          onLogout={handleLogout}
        />
      )}
      <main className="ck-learning-content">
        {active && logoutNotice && (
          <section className="mb-6 max-w-3xl mx-auto w-full" role="alert">
            <Card className="ck-home-preview">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-ink">
                  Chưa đăng xuất được
                </h2>
                <p className="text-sm text-muted mt-1">
                  Yêu cầu đăng xuất chưa hoàn tất. Hãy thử lại.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  ref={focusLogoutRetry}
                  type="button"
                  className="ck-button ck-button--primary"
                  onClick={handleLogout}
                >
                  Thử đăng xuất lại
                </button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLogoutNotice(false);
                    triggerRef.current?.focus();
                  }}
                >
                  Đóng
                </Button>
              </div>
            </Card>
          </section>
        )}
        <Outlet context={coordination} />
      </main>
    </>
  );
}
