import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { PageContainer } from '../../components/layout/PageContainer.jsx';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { useAuth } from '../auth/use-auth.js';
import { api } from '../../services/api-client.js';
import chiiLogo from '../../assets/brand/chii-logo.svg';
import usagiImg from '../../assets/mascots/usagi.png';
import hachiwareImg from '../../assets/mascots/hachiware.png';
import waitingMascotImg from '../../assets/mascots/Waiting mascot.png';
import { activeLocationRef } from './navigation-tracker.js';

const VALID_COORDINATION_MODES = [
  'idle',
  'searching',
  'proposed',
  'inviting',
  'requestingInvite',
  'inSession',
];

/**
 * SC-03: Trang chính (Home) dành cho Người học sau đăng nhập (04 §5.1, §3.2, docs/frontend/design-system.md).
 * Tái cấu trúc theo bản thiết kế mới Figma Make: Centered Hero với 2 linh vật Usagi & Hachiware.
 * Nối dữ liệu người học thật qua auth/me và trạng thái điều phối me/coordination (chống tạo luồng kép).
 *
 * @param {{ onStart?: () => void }} [props] - Hỗ trợ prop onStart cho Storybook & KaiwaDemo
 */
export function Home({ onStart } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [prevLocationState, setPrevLocationState] = useState(location.state);
  const [logoutNotice, setLogoutNotice] = useState(
    Boolean(location.state?.logoutFailed),
  );
  const logoutInFlight = useRef(false);

  if (location.state !== prevLocationState) {
    setPrevLocationState(location.state);
    if (location.state?.logoutFailed) {
      setLogoutNotice(true);
    }
  }

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const retryRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menuId = 'ck-account-menu';

  const [coordination, setCoordination] = useState(
    /** @type {{ mode: string, resourceId?: string } | null} */ (null),
  );
  const [coordinationLoading, setCoordinationLoading] = useState(true);
  const [coordinationError, setCoordinationError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetryCoordination = () => {
    setCoordinationLoading(true);
    setCoordinationError(false);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (location.state?.logoutFailed) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
        { replace: true, state: null },
      );
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    if (logoutNotice) {
      retryRef.current?.focus();
    }
  }, [logoutNotice]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    /** @param {MouseEvent} event */
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(/** @type {Node} */ (event.target))
      ) {
        setIsDropdownOpen(false);
      }
    };

    /** @param {KeyboardEvent} event */
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const focusInside = dropdownRef.current?.contains(document.activeElement);
      setIsDropdownOpen(false);
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
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setIsDropdownOpen(false);
    const originKey = location.key;
    const homeLocation = {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    };
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
        (currentLoc.key !== originKey ||
          currentLoc.pathname !== homeLocation.pathname)
      ) {
        return;
      }
      navigate(homeLocation, { replace: true, state: { logoutFailed: true } });
    } finally {
      logoutInFlight.current = false;
    }

    if (logoutSuccess) {
      navigate('/login', { replace: true });
    }
  };

  useEffect(() => {
    let isMounted = true;

    api
      .get('/me/coordination')
      .then((res) => {
        if (!isMounted) return;
        const data = /** @type {{ mode?: string, resourceId?: string }} */ (
          res.data
        );
        const mode = data?.mode;
        const resourceId =
          typeof data?.resourceId === 'string' ? data.resourceId.trim() : '';
        const isValidMode = Boolean(
          mode && VALID_COORDINATION_MODES.includes(mode),
        );
        const isValidSession = mode !== 'inSession' || Boolean(resourceId);

        if (isValidMode && isValidSession && mode) {
          setCoordination({
            mode,
            resourceId,
          });
        } else {
          setCoordinationError(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCoordinationError(true);
      })
      .finally(() => {
        if (isMounted) {
          setCoordinationLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [retryKey]);

  const handleStart = () => {
    if (typeof onStart === 'function') {
      onStart();
    } else {
      navigate('/match');
    }
  };

  const isBusy = Boolean(coordination && coordination.mode !== 'idle');
  const isStartDisabled = onStart
    ? false
    : coordinationLoading || coordinationError || isBusy;

  const displayName = user?.displayName || 'Người học';
  const level = user?.profile?.level;

  return (
    <>
      <header className="ck-home-header" role="banner">
        {/* Brand logo & name */}
        <Link
          className="ck-brand"
          to="/home"
          aria-label="Chiikaiwa, trang chính"
        >
          <img
            src={chiiLogo}
            alt=""
            width="36"
            height="40"
            className="inline-block flex-shrink-0"
          />
          <span className="ck-brand-text">Chiikaiwa</span>
        </Link>

        {/* Center Floating Pill Navigation Bar (Figma Make) */}
        <nav aria-label="Điều hướng chính" className="ck-nav-pill-bar">
          <div className="ck-nav-tab ck-nav-tab--active">
            <img
              src={waitingMascotImg}
              alt=""
              className="ck-nav-tab-mascot"
              width="22"
              height="22"
            />
            <Link to="/home" aria-current="page" className="ck-nav-tab-link">
              Trang chủ
            </Link>
          </div>
          <button
            type="button"
            className="ck-nav-tab-link"
            onClick={handleStart}
            disabled={isStartDisabled}
          >
            Luyện nói
          </button>
          <Link to="/topics" className="ck-nav-tab-link">
            Kho chủ đề
          </Link>
          <Link to="/saved" className="ck-nav-tab-link">
            Đã lưu
          </Link>
          <Link to="/history" className="ck-nav-tab-link">
            Lịch sử
          </Link>
        </nav>

        {/* Right User Profile pill with dropdown menu */}
        <div className="ck-profile-dropdown-container" ref={dropdownRef}>
          <button
            ref={triggerRef}
            type="button"
            className="ck-profile-pill"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            aria-expanded={isDropdownOpen}
            aria-controls={isDropdownOpen ? menuId : undefined}
            aria-label={`Menu tài khoản: ${displayName}${level ? ` ${level}` : ''}`}
          >
            <Avatar name={displayName} size={32} />
            <span className="font-semibold">{displayName}</span>
            {level ? <Badge tone="accent">{level}</Badge> : null}
            <span className="text-xs text-muted" aria-hidden="true">
              ▾
            </span>
          </button>

          {isDropdownOpen && (
            <div id={menuId} className="ck-profile-dropdown">
              <Link
                to="/profile"
                className="ck-profile-dropdown-item"
                onClick={() => setIsDropdownOpen(false)}
              >
                <span>Hồ sơ của tôi</span>
              </Link>
              <button
                type="button"
                className="ck-profile-dropdown-item ck-profile-dropdown-item--danger"
                onClick={handleLogout}
              >
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <PageContainer as="main" id="ck-home" className="ck-home">
        {/* Banner thông báo khi đăng xuất chưa hoàn tất (A1–A4) */}
        {logoutNotice && (
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
                  ref={retryRef}
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

        {/* Thông báo lỗi khi không thể tải trạng thái điều phối */}
        {coordinationError && (
          <section
            className="mb-6 max-w-3xl mx-auto w-full"
            role="status"
            aria-live="polite"
          >
            <Card className="ck-home-preview">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-ink">
                  Không thể kiểm tra trạng thái điều phối
                </h2>
                <p className="text-sm text-muted mt-1">
                  Đã xảy ra lỗi khi đồng bộ trạng thái phòng luyện. Vui lòng thử
                  lại trước khi bắt đầu.
                </p>
              </div>
              <div>
                <Button variant="secondary" onClick={handleRetryCoordination}>
                  Thử lại
                </Button>
              </div>
            </Card>
          </section>
        )}

        {/* Banner điều phối khi có luồng đang chiếm chỗ (SC-03 contract: không tạo luồng thứ hai) */}
        {isBusy && coordination && (
          <section
            className="mb-6 max-w-3xl mx-auto w-full"
            role="status"
            aria-live="polite"
          >
            <Card className="ck-home-preview">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-ink">
                  Luồng luyện tập đang diễn ra
                </h2>
                <p className="text-sm text-muted mt-1">
                  {coordination.mode === 'inSession' &&
                    'Bạn đang có một phiên hội thoại đang hoạt động.'}
                  {coordination.mode === 'searching' &&
                    'Bạn đang trong hàng đợi tìm bạn luyện Tomodachi.'}
                  {coordination.mode === 'proposed' &&
                    'Đã tìm thấy bạn luyện phù hợp. Đang chờ xác nhận phiên.'}
                  {(coordination.mode === 'inviting' ||
                    coordination.mode === 'requestingInvite') &&
                    'Bạn đang có yêu cầu phòng mời đang được xử lý.'}
                </p>
              </div>
              <div>
                {coordination.mode === 'inSession' &&
                  coordination.resourceId && (
                    <Link
                      to={`/room/${encodeURIComponent(coordination.resourceId)}`}
                      className="ck-button ck-button--primary"
                    >
                      Vào lại phòng <Icon name="arrow" />
                    </Link>
                  )}
                {(coordination.mode === 'searching' ||
                  coordination.mode === 'proposed') && (
                  <Link to="/match" className="ck-button ck-button--primary">
                    Xem trạng thái <Icon name="arrow" />
                  </Link>
                )}
                {(coordination.mode === 'inviting' ||
                  coordination.mode === 'requestingInvite') && (
                  <Link
                    to="/invitation"
                    className="ck-button ck-button--primary"
                  >
                    Xem phòng mời <Icon name="arrow" />
                  </Link>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* Centered Hero Section (Bản thiết kế mới Figma Make) */}
        <div className="ck-home-hero">
          {/* Linh vật thỏ Usagi bên trái */}
          <div className="ck-hero-mascot ck-hero-mascot--left">
            <div className="ck-speech-bubble ck-speech-bubble--left">
              <span lang="ja" aria-hidden="true">
                いっしょに？
              </span>
            </div>
            <img
              src={usagiImg}
              alt=""
              className="ck-mascot-img"
              width="215"
              height="260"
              decoding="async"
            />
          </div>

          {/* Cụm nội dung & Hành động trung tâm */}
          <div className="ck-hero-center">
            <h1 className="sr-only">Trang chính</h1>
            <h2 className="ck-hero-title">Hôm nay mình nói gì nhỉ?</h2>
            <p className="ck-hero-subtitle">
              Một cuộc trò chuyện nhỏ, thêm chút tự tin.
            </p>

            {/* Nút chính lớn: Tìm bạn luyện nói */}
            <div className="ck-hero-primary-action">
              <Button
                variant="primary"
                size="hero"
                className="ck-hero-btn-start"
                onClick={handleStart}
                disabled={isStartDisabled}
                leadingIcon={<Icon name="search" size={20} />}
                trailingIcon={<Icon name="arrow" size={20} />}
              >
                Tìm bạn luyện nói
              </Button>
            </div>

            {/* Hàng nút phụ: Tạo mã mời / Nhập mã (Tuân thủ trạng thái điều phối) */}
            <div className="ck-hero-secondary-actions">
              <button
                type="button"
                className="ck-button ck-button--secondary ck-hero-btn-pill"
                onClick={() => navigate('/invitation')}
                disabled={isStartDisabled}
              >
                <Icon name="note" size={16} />
                <span>Tạo mã mời</span>
              </button>
              <button
                type="button"
                className="ck-button ck-button--secondary ck-hero-btn-pill"
                onClick={() => navigate('/invitation')}
                disabled={isStartDisabled}
              >
                <Icon name="cards" size={16} />
                <span>Nhập mã</span>
              </button>
            </div>

            {/* 3 Chip chủ đề nhanh */}
            <div className="ck-hero-topics">
              <Link to="/topics" className="ck-topic-chip ck-topic-chip--pink">
                <span className="ck-topic-chip-ja" lang="ja">
                  カフェで
                </span>
                <span className="ck-topic-chip-vi">Ở quán cà phê</span>
              </Link>
              <Link to="/topics" className="ck-topic-chip ck-topic-chip--blue">
                <span className="ck-topic-chip-ja" lang="ja">
                  道を聞く
                </span>
                <span className="ck-topic-chip-vi">Hỏi đường</span>
              </Link>
              <Link
                to="/topics"
                className="ck-topic-chip ck-topic-chip--yellow"
              >
                <span className="ck-topic-chip-ja" lang="ja">
                  アルバイト
                </span>
                <span className="ck-topic-chip-vi">Việc làm thêm</span>
              </Link>
            </div>
          </div>

          {/* Linh vật mèo Hachiware bên phải */}
          <div className="ck-hero-mascot ck-hero-mascot--right">
            <div className="ck-speech-bubble ck-speech-bubble--right">
              <span lang="ja" aria-hidden="true">
                話そう！
              </span>
            </div>
            <img
              src={hachiwareImg}
              alt=""
              className="ck-mascot-img"
              width="215"
              height="240"
              decoding="async"
            />
          </div>
        </div>

        <footer className="ck-home-footer" role="contentinfo">
          <span>ちいさな会話 · chiikaiwa</span>
          <span>Không gian luyện tập hội thoại 1-1</span>
        </footer>
      </PageContainer>
    </>
  );
}
