import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import chiiLogo from '../../assets/brand/chii-logo.svg';
import tabMascot from '../../assets/mascots/header-chiikawa.png';
import { chiikawa } from '../../assets/mascots/mascots.js';
import { Mascot } from '../Mascot.jsx';
import { useAuth } from '../../features/auth/use-auth.js';
import { PillMotion } from '../ui/PillMotion.jsx';
import { Avatar, Badge } from '../ui/surfaces.jsx';
import './learning-header.css';

/** @param {{to: string, children: import('react').ReactNode}} props */
function LearningLink({ to, children }) {
  return (
    <NavLink to={to} className="ck-nav-tab-link">
      <img
        src={tabMascot}
        alt=""
        className="ck-nav-tab-mascot"
        data-pill-icon=""
        width="28"
        height="28"
      />
      {children}
    </NavLink>
  );
}

/**
 * @param {{
 *   isHome: boolean,
 *   practiceDisabled: boolean,
 *   triggerRef: import('react').RefObject<HTMLButtonElement | null>,
 *   onLogout: () => void,
 * }} props
 */
export function LearningHeader({
  isHome,
  practiceDisabled,
  triggerRef,
  onLogout,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, kind } = useAuth();
  const guestView = kind === 'guest';
  const displayName =
    user?.displayName || (guestView ? 'Khách dùng thử' : 'Người học');
  const level = user?.profile?.level;
  const [menuLocation, setMenuLocation] = useState(
    /** @type {typeof location | null} */ (null),
  );
  const isDropdownOpen = menuLocation === location;
  const dropdownRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const menuId = useId();

  if (menuLocation && !isDropdownOpen) {
    setMenuLocation(null);
  }

  useEffect(() => {
    if (!isDropdownOpen) return;

    /** @param {MouseEvent} event */
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(/** @type {Node} */ (event.target))
      ) {
        setMenuLocation(null);
      }
    };

    /** @param {KeyboardEvent} event */
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const focusInside = dropdownRef.current?.contains(document.activeElement);
      setMenuLocation(null);
      if (focusInside) {
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen, triggerRef]);

  const handleMenuLogout = () => {
    setMenuLocation(null);
    onLogout();
  };

  return (
    <header className="ck-learning-header">
      <div className="ck-learning-header__inner">
        <Link
          className="ck-brand"
          to={guestView ? '/invitation' : '/home'}
          aria-label={
            guestView ? 'Chiikaiwa, phòng mời' : 'Chiikaiwa, trang chính'
          }
        >
          <img
            src={chiiLogo}
            alt=""
            width="41"
            height="45"
            className="ck-learning-logo"
          />
          <span className="ck-brand-text">Chiikaiwa</span>
          <Mascot
            asset={chiikawa}
            alt=""
            width="36"
            height="35"
            className="ck-learning-wave"
          />
        </Link>

        <nav
          aria-label="Điều hướng chính"
          className="ck-nav-pill-bar ck-motion-group"
        >
          <PillMotion />
          {!guestView && <LearningLink to="/home">Trang chủ</LearningLink>}
          {isHome ? (
            <button
              type="button"
              className="ck-nav-tab-link"
              onClick={() => navigate('/match')}
              disabled={practiceDisabled}
            >
              Luyện nói
            </button>
          ) : (
            <LearningLink to={guestView ? '/invitation' : '/match'}>
              Luyện nói
            </LearningLink>
          )}
          <LearningLink to="/topics">Kho chủ đề</LearningLink>
          <LearningLink to="/saved">Ôn cá nhân</LearningLink>
          {!guestView && <LearningLink to="/history">Lịch sử</LearningLink>}
        </nav>
        <div className="ck-learning-account">
          {level && (
            <Badge tone="accent" className="ck-learning-level">
              <span className="sr-only">Trình độ </span>
              {level}
            </Badge>
          )}
          <div className="ck-profile-dropdown-container" ref={dropdownRef}>
            <button
              ref={triggerRef}
              type="button"
              className="ck-profile-pill"
              onClick={() => setMenuLocation(isDropdownOpen ? null : location)}
              aria-expanded={isDropdownOpen}
              aria-controls={isDropdownOpen ? menuId : undefined}
              aria-label={`Menu tài khoản: ${displayName}`}
            >
              <Avatar name={displayName} size={32} />
              <span className="ck-profile-name font-semibold">
                {displayName}
              </span>
              <span className="text-xs text-muted" aria-hidden="true">
                ▾
              </span>
            </button>

            {isDropdownOpen && (
              <div id={menuId} className="ck-profile-dropdown">
                {!guestView && (
                  <>
                    <Link
                      to="/profile"
                      className="ck-profile-dropdown-item"
                      onClick={() => setMenuLocation(null)}
                    >
                      <span>Hồ sơ của tôi</span>
                    </Link>
                    <Link
                      to="/blocks"
                      className="ck-profile-dropdown-item"
                      onClick={() => setMenuLocation(null)}
                    >
                      <span>Danh sách chặn</span>
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  className="ck-profile-dropdown-item ck-profile-dropdown-item--danger"
                  onClick={handleMenuLogout}
                >
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
