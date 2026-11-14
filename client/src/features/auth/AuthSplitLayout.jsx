import { Link } from 'react-router';
import usagi from '../../assets/mascots/usagi.png';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';

/**
 * Shared 2-column split layout for SC-02 (/login and /register)
 * built on top of the design system AuthLayout primitive.
 *
 * @param {Object} props
 * @param {string} props.eyebrow Japanese greeting above the heading
 * @param {string} props.title Main Vietnamese heading displayed visually
 * @param {string} props.accessibleTitle Accessible heading name for screen readers & route tests
 * @param {string} props.subtitle Supporting subtitle below the heading
 * @param {string} [props.mascotSrc] Optional mascot image source
 * @param {string} [props.mascotAlt] Optional mascot alt text
 * @param {import('react').ReactNode} props.children Form or confirmation content
 * @param {import('react').ReactNode} [props.footer] Bottom prompt link
 */
export function AuthSplitLayout({
  eyebrow,
  title,
  accessibleTitle,
  subtitle,
  mascotSrc = usagi,
  mascotAlt = 'Mascot Chiikaiwa',
  children,
  footer,
}) {
  return (
    <section
      className="ck-auth-screen"
      data-screen-id="SC-02"
      aria-label={accessibleTitle}
    >
      <AuthLayout mascotSrc={mascotSrc} mascotAlt={mascotAlt}>
        <div className="ck-auth-card">
          <div className="ck-auth-panel__topbar">
            <Link to="/" className="ck-auth-back-link">
              <span aria-hidden="true">←</span>
              <span>Về trang chủ</span>
            </Link>
          </div>

          <header className="ck-auth-card__header">
            <Badge tone="accent">
              <span lang="ja">{eyebrow}</span>
            </Badge>
            <h1 className="ck-auth-title" aria-label={accessibleTitle}>
              {title}
            </h1>
            <p className="ck-auth-subtitle">{subtitle}</p>
          </header>

          {children}

          {footer ? <footer className="ck-auth-footer">{footer}</footer> : null}
        </div>
      </AuthLayout>
    </section>
  );
}
