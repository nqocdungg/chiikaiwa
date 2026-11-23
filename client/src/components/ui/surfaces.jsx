import { useState } from 'react';

/**
 * @param {{
 * children: import('react').ReactNode,
 * interactive?: boolean,
 * selected?: boolean,
 * className?: string,
 * onClick?: import('react').MouseEventHandler<HTMLButtonElement>,
 * disabled?: boolean,
 * }} props
 */
export function Card({
  children,
  interactive = false,
  selected = false,
  className = '',
  onClick,
  disabled,
}) {
  const classes = [
    'ck-card',
    interactive ? 'ck-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        aria-pressed={selected}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    );
  }

  return <article className={classes}>{children}</article>;
}

/**
 * @param {{
 * src?: string,
 * alt?: string,
 * name: string,
 * size?: 32|40|48|64,
 * className?: string,
 * }} props
 */
export function Avatar({ src, alt = '', name, size = 40, className = '' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('');

  return (
    <span
      className={`ck-avatar ck-avatar--${size} ${className}`.trim()}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      title={name}
    >
      <span aria-hidden="true">{initials || '?'}</span>
      {src && !imageFailed ? (
        <img
          className="ck-avatar__image"
          src={src}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </span>
  );
}

/** @param {{children: import('react').ReactNode, tone?: 'neutral'|'accent'|'success'|'warning'|'danger', className?: string}} props */
export function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`ck-badge ${tone !== 'neutral' ? `ck-badge--${tone}` : ''} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
