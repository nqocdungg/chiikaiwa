import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';
import { GreetingBubble } from '../../components/ui/GreetingBubble.jsx';
import '../../components/ui/study-studio.css';
import './auth-study.css';

/**
 * Shared 2-column split layout for SC-02 (/login and /register)
 * built on top of the design system AuthLayout primitive.
 *
 * @param {Object} props
 * @param {string} props.eyebrow Japanese greeting above the heading
 * @param {string} props.greetingTranslation Vietnamese translation
 * @param {string} props.title Main Vietnamese heading displayed visually
 * @param {string} props.accessibleTitle Accessible heading name for screen readers & route tests
 * @param {string} props.subtitle Supporting subtitle below the heading
 * @param {string} props.illustration Decorative mascot scene
 * @param {import('react').ReactNode} props.children Form or confirmation content
 * @param {import('react').ReactNode} [props.footer] Bottom prompt link
 */
export function AuthSplitLayout({
  eyebrow,
  greetingTranslation,
  title,
  accessibleTitle,
  subtitle,
  illustration,
  children,
  footer,
}) {
  return (
    <section
      className="ck-auth-screen ck-auth-screen--study"
      data-screen-id="SC-02"
      aria-label={accessibleTitle}
    >
      <AuthLayout
        scrollable
        visual={
          <div className="ck-auth-study-scene">
            <GreetingBubble
              className="ck-auth-study-scene__greeting"
              japanese={eyebrow}
              translation={greetingTranslation}
            />
            <img src={illustration} width="840" height="560" alt="" />
          </div>
        }
      >
        <div className="ck-auth-card">
          <div className="ck-auth-panel__topbar">
            <Link to="/" className="ck-auth-back-link">
              <span aria-hidden="true">←</span>
              <span>Về trang chủ</span>
            </Link>
          </div>

          <header className="ck-auth-card__header">
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
