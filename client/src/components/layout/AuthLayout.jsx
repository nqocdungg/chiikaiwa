import logo from '../../assets/brand/chii-logo.svg';

/**
 * @param {{
 * children: import('react').ReactNode,
 * mascotSrc?: string,
 * mascotAlt?: string,
 * visual?: import('react').ReactNode,
 * className?: string,
 * }} props
 */
export function AuthLayout({
  children,
  mascotSrc,
  mascotAlt = '',
  visual,
  className = '',
}) {
  return (
    <div className={`ck-auth-layout ${className}`.trim()}>
      <div className="ck-auth-layout__visual" aria-hidden={!mascotAlt}>
        {visual ??
          (mascotSrc ? (
            <img
              className="ck-auth-layout__mascot"
              src={mascotSrc}
              alt={mascotAlt}
            />
          ) : null)}
      </div>
      <div className="ck-auth-layout__content">
        <div className="ck-auth-layout__panel">
          <a
            className="ck-brand-lockup"
            href="/"
            aria-label="Chiikaiwa — Trang chủ"
          >
            <img src={logo} alt="" />
            <span>Chiikaiwa</span>
          </a>
          {children}
        </div>
      </div>
    </div>
  );
}
