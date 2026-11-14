import { Link } from 'react-router';
import { Friends } from '../../components/Friends.jsx';

/**
 * Shared 2-column split layout for SC-02 (/login and /register)
 * matching the Chiikaiwa Figma Make auth screens.
 *
 * @param {Object} props
 * @param {string} props.eyebrow Japanese greeting above the heading
 * @param {string} props.title Main Vietnamese heading displayed visually
 * @param {string} props.accessibleTitle Accessible heading name for screen readers & route tests
 * @param {string} props.subtitle Supporting subtitle below the heading
 * @param {import('react').ReactNode} props.children Form or confirmation content
 * @param {import('react').ReactNode} [props.footer] Bottom prompt link
 */
export function AuthSplitLayout({
  eyebrow,
  title,
  accessibleTitle,
  subtitle,
  children,
  footer,
}) {
  return (
    <section
      className="ck-auth-screen"
      data-screen-id="SC-02"
      aria-label={accessibleTitle}
    >
      <div className="ck-auth-split">
        <aside className="ck-auth-hero" aria-label="Giới thiệu Chiikaiwa">
          <div className="ck-auth-hero__orb" aria-hidden="true" />
          <div className="ck-auth-hero__top">
            <Link
              to="/"
              className="ck-auth-brand"
              aria-label="Trang chủ Chiikaiwa"
            >
              <span className="ck-auth-brand__badge" aria-hidden="true">
                <span className="ck-auth-brand__ear ck-auth-brand__ear--left" />
                <span className="ck-auth-brand__ear ck-auth-brand__ear--right" />
                <span className="ck-auth-brand__glyph">ち</span>
              </span>
              <span className="ck-auth-brand__text">Chiikaiwa</span>
            </Link>

            <div className="ck-auth-hero__copy">
              <h2 className="ck-auth-hero__headline">
                Mỗi cuộc trò chuyện nhỏ đều là một bước tiến.
              </h2>
              <p className="ck-auth-hero__subtitle">
                Cùng mở lời, luyện tập và tự tin hơn với tiếng Nhật mỗi ngày.
              </p>
            </div>
          </div>

          <div className="ck-auth-hero__art">
            <Friends />
          </div>
        </aside>

        <div className="ck-auth-panel">
          <div className="ck-auth-panel__topbar">
            <Link to="/" className="ck-auth-back-link">
              <span aria-hidden="true">←</span>
              <span>Về trang chủ</span>
            </Link>
          </div>

          <div className="ck-auth-panel__body">
            <div className="ck-auth-card">
              <header className="ck-auth-card__header">
                <p className="ck-auth-eyebrow" lang="ja">
                  {eyebrow}
                </p>
                <h1 className="ck-auth-title" aria-label={accessibleTitle}>
                  {title}
                </h1>
                <p className="ck-auth-subtitle">{subtitle}</p>
              </header>

              {children}

              {footer ? (
                <footer className="ck-auth-footer">{footer}</footer>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
