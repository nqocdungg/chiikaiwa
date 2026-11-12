import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Friends } from '../../components/Friends.jsx';
import { useAuth } from '../auth/use-auth.js';
import { api } from '../../services/api-client.js';

/**
 * SC-03: Trang chính (Home) dành cho Người học sau đăng nhập (04 §5.1, §3.2).
 * Tái sử dụng bố cục, typography và bảng màu đã chốt.
 * Nối dữ liệu người học thật qua auth/me và trạng thái điều phối me/coordination.
 *
 * @param {{ onStart?: () => void }} [props] - Hỗ trợ prop onStart cho Storybook & KaiwaDemo
 */
export function Home({ onStart } = {}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [coordination, setCoordination] = useState(
    /** @type {{ mode: string, resourceId?: string } | null} */ (null),
  );
  const [coordinationLoading, setCoordinationLoading] = useState(true);
  const [coordinationError, setCoordinationError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleRetryCoordination = () => {
    setCoordinationLoading(true);
    setCoordinationError(false);
    setRetryKey((k) => k + 1);
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
        if (data?.mode) {
          setCoordination({
            mode: data.mode,
            resourceId: data.resourceId,
          });
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

  const handleLogout = async () => {
    setLogoutError('');
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      setLogoutError('Đăng xuất không thành công. Vui lòng thử lại.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isBusy = Boolean(coordination && coordination.mode !== 'idle');
  const isStartDisabled = onStart
    ? false
    : coordinationLoading || coordinationError || isBusy;

  const displayName = user?.displayName || 'Người học';
  const level = user?.profile?.level;
  const avatarLetter = (displayName[0] || 'U').toUpperCase();

  return (
    <>
      <header className="ck-home-header" role="banner">
        <Link
          className="ck-brand"
          to="/home"
          aria-label="Chiikaiwa, trang chính"
        >
          <span lang="ja">ち</span>chiikaiwa
        </Link>
        <nav aria-label="Điều hướng chính">
          <Link to="/home" aria-current="page" className="ck-nav-link">
            Trang chính
          </Link>
          <button
            type="button"
            className="ck-nav-link"
            onClick={handleStart}
            disabled={isStartDisabled}
          >
            Luyện hội thoại
          </button>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="ck-profile text-inherit no-underline"
            aria-label={`Hồ sơ cá nhân: ${displayName}`}
          >
            <span className="ck-avatar" aria-hidden="true">
              {avatarLetter}
            </span>
            <span>
              {displayName}
              {level ? <small className="ml-1">{level}</small> : null}
            </span>
          </Link>
          <button
            type="button"
            className="text-xs text-muted hover:text-ink underline bg-transparent border-0 cursor-pointer p-1"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Đăng xuất khỏi tài khoản"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main id="ck-home" className="ck-home">
        {logoutError && (
          <div className="mb-4 text-xs text-danger" role="alert">
            {logoutError}
          </div>
        )}

        {/* Thông báo lỗi khi không thể tải trạng thái điều phối */}
        {coordinationError && (
          <section
            className="ck-home-preview mb-6"
            role="status"
            aria-live="polite"
          >
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
          </section>
        )}

        {/* Banner điều phối khi có luồng đang chiếm chỗ (SC-03 contract: không tạo luồng thứ hai) */}
        {isBusy && coordination && (
          <section
            className="ck-home-preview mb-6"
            role="status"
            aria-live="polite"
          >
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
              {coordination.mode === 'inSession' && coordination.resourceId && (
                <Link
                  to={`/room/${coordination.resourceId}`}
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
                <Link to="/invitation" className="ck-button ck-button--primary">
                  Xem phòng mời <Icon name="arrow" />
                </Link>
              )}
            </div>
          </section>
        )}

        <div className="ck-home-layout">
          <section className="ck-welcome" aria-labelledby="home-welcome-title">
            <h1
              id="home-welcome-title"
              className="text-2xl font-semibold text-ink"
            >
              Trang chính
            </h1>
            <p className="text-3xl font-bold mt-2 text-ink leading-tight">
              Một câu chào,
              <br />
              một câu chuyện mới.
            </p>
            <p>
              Luyện hội thoại tiếng Nhật cùng một người bạn theo các tình huống
              thực tế.
            </p>
            <div className="ck-actions">
              <Button
                variant="primary"
                onClick={handleStart}
                disabled={isStartDisabled}
                aria-label="Tìm bạn luyện hội thoại"
              >
                Tìm bạn luyện <Icon name="arrow" />
              </Button>
              <Link to="/invitation" className="ck-button ck-button--secondary">
                Dùng mã mời
              </Link>
            </div>
            <span className="ck-device-note">
              <Icon name="camera" size={16} />
              Mic và camera là tùy chọn.
            </span>
          </section>

          <section className="ck-study" aria-labelledby="home-study-heading">
            <Friends />
            <h2 id="home-study-heading">Góc học của bạn</h2>
            {[
              { name: 'Học theo chủ đề', icon: 'book', to: '/topics' },
              { name: 'Ôn cá nhân', icon: 'cards', to: '/saved' },
              { name: 'Lịch sử luyện tập', icon: 'clock', to: '/history' },
            ].map((item) => (
              <Link
                key={item.name}
                to={item.to}
                className="ck-study-link"
                aria-label={item.name}
              >
                <Icon name={item.icon} />
                <span>{item.name}</span>
                <Icon name="arrow" size={18} />
              </Link>
            ))}
          </section>
        </div>

        <footer className="ck-home-footer" role="contentinfo">
          <span>ちいさな会話 · chiikaiwa</span>
          <span>Không gian luyện tập hội thoại 1-1</span>
        </footer>
      </main>
    </>
  );
}
