import { Link } from 'react-router';
import { PageContainer } from '../../components/layout/PageContainer.jsx';
import { Icon } from '../../components/ui/controls.jsx';
import { useAuth } from '../auth/use-auth.js';
import chiiLogo from '../../assets/brand/chii-logo.svg';
import usagiImg from '../../assets/mascots/bouncing-usagi.gif';
import hachiwareImg from '../../assets/mascots/waving-hachiware.gif';

/**
 * SC-01: Landing Page công khai của Chiikaiwa (04 §5.1, §3.2, docs/frontend/design-system.md).
 * Đồng bộ với ngôn ngữ thị giác mới (Figma Make): Centered Hero, 2 linh vật Usagi & Hachiware.
 * Giới thiệu luyện hội thoại 1-1 theo vai và thẻ tình huống.
 * Không ép đăng nhập; người đã đăng nhập có lối vào theo role (SC-03 cho learner, /admin cho admin).
 */
export function Landing() {
  const { kind, user, role, isLoading } = useAuth();
  const isAuthenticated = kind === 'user' && Boolean(user);
  const isAdmin = role === 'admin';
  const ctaPath = isAdmin ? '/admin' : '/home';
  const ctaNavLabel = isAdmin ? 'Khu vực quản trị' : 'Trang chính';
  const ctaActionLabel = isAdmin ? 'Vào khu quản trị' : 'Vào trang chính';

  return (
    <div className="ck-landing">
      <header className="ck-home-header" role="banner">
        <Link
          className="ck-brand"
          to="/"
          aria-label="Chiikaiwa, trang giới thiệu"
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
        <h1 className="sr-only">Chiikaiwa</h1>
        <nav aria-label="Điều hướng chính">
          {isLoading ? (
            <div
              className="flex items-center gap-3 opacity-0 pointer-events-none"
              aria-hidden="true"
            >
              <span className="ck-nav-link">Đăng nhập</span>
              <span className="ck-button ck-button--secondary text-xs !min-h-0 !py-1.5 !px-3.5 !rounded-full">
                Đăng ký
              </span>
            </div>
          ) : isAuthenticated ? (
            <Link to={ctaPath} className="ck-nav-link">
              {ctaNavLabel}
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="ck-nav-link">
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className="ck-button ck-button--secondary text-xs !min-h-0 !py-1.5 !px-3.5 !rounded-full"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </nav>
      </header>

      <PageContainer as="main" id="ck-landing-main" className="ck-home">
        {/* Centered Hero Section đồng bộ với bản thiết kế mới */}
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

          {/* Cụm nội dung giới thiệu trung tâm */}
          <div className="ck-hero-center">
            <h2 id="landing-heading" className="ck-hero-title">
              Không gian luyện nói <br /> tiếng Nhật 1-1
            </h2>
            <p className="ck-hero-subtitle">
              Một câu chào, một câu chuyện mới.
              <br />
              Luyện hội thoại tiếng Nhật 1-1 cùng bạn học qua các tình huống{' '}
              <span className="whitespace-nowrap">thực tế.</span>
            </p>

            <div className="ck-hero-primary-action">
              {isAuthenticated ? (
                <Link
                  to={ctaPath}
                  className="ck-button ck-button--primary ck-button--hero ck-hero-btn-start"
                >
                  {ctaActionLabel} <Icon name="arrow" />
                </Link>
              ) : (
                <Link
                  to="/register"
                  className="ck-button ck-button--primary ck-button--hero ck-hero-btn-start"
                >
                  Bắt đầu ngay <Icon name="arrow" />
                </Link>
              )}
            </div>

            <div className="ck-hero-secondary-actions">
              <Link
                to="/invitation"
                className="ck-button ck-button--secondary ck-hero-btn-pill"
              >
                <Icon name="cards" size={16} />
                <span>Dùng mã mời</span>
              </Link>
            </div>

            <span className="ck-device-note">
              <Icon name="camera" size={16} />
              Mic và camera là tùy chọn.
            </span>
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
          <span>Nền tảng luyện hội thoại tiếng Nhật 1-1</span>
        </footer>
      </PageContainer>
    </div>
  );
}
