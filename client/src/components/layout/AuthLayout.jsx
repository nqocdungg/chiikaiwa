import logo from '../../assets/brand/chii-logo.svg';
import { Mascot } from '../Mascot.jsx';

/**
 * @param {{
 * children: import('react').ReactNode,
 * mascot?: { src: string, stillSrc: string },
 * mascotAlt?: string,
 * visual?: import('react').ReactNode,
 * scrollable?: boolean,
 * className?: string,
 * }} props
 */
export function AuthLayout({
  children,
  mascot,
  mascotAlt = '',
  visual,
  scrollable = false,
  className = '',
}) {
  const panelContent = (
    <>
      <a
        className="ck-brand-lockup"
        href="/"
        aria-label="Chiikaiwa — Trang chủ"
      >
        <img src={logo} alt="" />
        <span>Chiikaiwa</span>
      </a>
      {children}
    </>
  );

  return (
    <div className={`ck-auth-layout ${className}`.trim()}>
      <div className="ck-auth-layout__visual" aria-hidden={!mascotAlt}>
        {visual ??
          (mascot ? (
            <Mascot
              className="ck-auth-layout__mascot"
              asset={mascot}
              alt={mascotAlt}
            />
          ) : null)}
      </div>
      <div className="ck-auth-layout__content">
        <div className="ck-auth-layout__panel">
          {scrollable ? (
            <div className="ck-auth-layout__scroll">{panelContent}</div>
          ) : (
            panelContent
          )}
        </div>
      </div>
    </div>
  );
}
