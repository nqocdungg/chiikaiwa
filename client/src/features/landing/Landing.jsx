import { Link } from 'react-router';
import { Icon } from '../../components/ui/controls.jsx';
import { Friends } from '../../components/Friends.jsx';
import { useAuth } from '../auth/use-auth.js';

/**
 * SC-01: Landing Page công khai của Chiikaiwa (04 §5.1, §3.2).
 * Giới thiệu luyện hội thoại 1-1 theo vai và thẻ tình huống.
 * Không ép đăng nhập; người đã đăng nhập có lối vào theo role (SC-03 cho learner, /admin cho admin).
 */
export function Landing() {
  const { kind, user, role } = useAuth();
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
          <span lang="ja">ち</span>chiikaiwa
        </Link>
        <nav aria-label="Điều hướng chính">
          <Link to="/invitation" className="ck-nav-link">
            Nhập mã mời
          </Link>
          {isAuthenticated ? (
            <Link to={ctaPath} className="ck-nav-link" aria-current="page">
              {ctaNavLabel}
            </Link>
          ) : (
            <>
              <Link to="/login" className="ck-nav-link">
                Đăng nhập
              </Link>
              <Link to="/register" className="ck-button ck-button--primary">
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="ck-landing-main" className="ck-home">
        <div className="ck-home-layout">
          <section className="ck-welcome" aria-labelledby="landing-heading">
            <h1
              id="landing-heading"
              className="text-2xl font-semibold text-ink"
            >
              Chiikaiwa
            </h1>
            <p className="text-3xl font-bold mt-2 text-ink leading-tight">
              Một câu chào,
              <br />
              một câu chuyện mới.
            </p>
            <p>
              Luyện hội thoại tiếng Nhật 1-1 cùng bạn học qua các thẻ tình
              huống, phân vai tự nhiên và hệ thống gợi ý kiến thức cá nhân hóa.
            </p>
            <div className="ck-actions">
              {isAuthenticated ? (
                <Link to={ctaPath} className="ck-button ck-button--primary">
                  {ctaActionLabel} <Icon name="arrow" />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="ck-button ck-button--primary">
                    Bắt đầu ngay <Icon name="arrow" />
                  </Link>
                  <Link
                    to="/invitation"
                    className="ck-button ck-button--secondary"
                  >
                    Dùng mã mời
                  </Link>
                </>
              )}
            </div>
            <span className="ck-device-note">
              <Icon name="camera" size={16} />
              Mic và camera là tùy chọn.
            </span>
          </section>

          <section
            className="ck-study"
            aria-label="Hình minh họa luyện tập cùng bạn bè"
          >
            <Friends />
            <h2>Luyện tập tự nhiên</h2>
            <p className="text-muted text-sm leading-relaxed">
              Thực hành giao tiếp tiếng Nhật theo từng tình huống đời sống thực
              tế. Bạn và đối tác cùng bốc thẻ, nhận vai và hỗ trợ nhau phản xạ
              tự tin.
            </p>
          </section>
        </div>

        <footer className="ck-home-footer" role="contentinfo">
          <span>ちいさな会話 · chiikaiwa</span>
          <span>Nền tảng luyện hội thoại tiếng Nhật 1-1</span>
        </footer>
      </main>
    </div>
  );
}
