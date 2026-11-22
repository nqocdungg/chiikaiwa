/** @param {{name: string, size?: number, className?: string}} props */
export function Icon({ name, size = 20, className }) {
  const paths = {
    home: 'm3 10 9-7 9 7v10H3Z M9 20v-7h6v7',
    book: 'M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15',
    chat: 'M4 4h16v12H9l-5 4Z M8 8h8 M8 12h5',
    cards: 'm8 3 13 3-4 15-13-3Z M3 5 1 18l3 1',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
    mic: 'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Zm-3 6v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8',
    micOff:
      'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Zm-3 6v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8 M3 3l18 18',
    camera: 'M3 6h12v12H3Z m12 4 6-4v12l-6-4',
    cameraOff: 'M3 6h12v12H3Z m12 4 6-4v12l-6-4 M3 3l18 18',
    screen: 'M3 3h18v14H3Z M12 17v4 M7 21h10',
    exit: 'M9 4H3v16h6 M9 12h12 m-5-5 5 5-5 5',
    note: 'M5 3h14v18H5Z M8 8h8 M8 12h8 M8 16h5',
    star: 'm12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z',
    check: 'm5 12 4 4L19 6',
    lock: 'M5 10h14v11H5Z M8 10V6a4 4 0 0 1 8 0v4',
    clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    swap: 'M4 7h16 m-4-4 4 4-4 4 M20 17H4 m4-4-4 4 4 4',
    close: 'm5 5 14 14 M19 5 5 19',
    copy: 'M9 9h11v11H9Z M4 15H3V3h12v1',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    eyeOff:
      'm3 3 18 18 M10.6 6.1A11 11 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.1 2.8 M6.7 6.7C3.6 8.4 2 12 2 12s3.5 6 10 6a11 11 0 0 0 4.2-.8 M9.9 9.9a3 3 0 0 0 4.2 4.2',
    search: 'm21 21-4.3-4.3 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    filter: 'M3 4h18l-7 8v6l-4 2v-8Z',
    dice: 'M4 4h16v16H4Z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01',
    chevronLeft: 'm15 5-7 7 7 7',
    chevronRight: 'm9 5 7 7-7 7',
    flag: 'M5 22V3c5-4 10 4 14 0v11c-4 4-9-4-14 0',
    sprout:
      'M12 21v-9 M12 13C5 13 3 10 3 5c6 0 9 2 9 8Zm0 2c7 0 9-3 9-8-6 0-9 2-9 8Z',
    translate:
      'M3 5h12 M9 2v3 M5 8c1 4 4 7 8 9 M12 5c0 5-3 9-8 12 M14 21l4-11 4 11 M16 17h4',
  };
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={paths[/** @type {keyof typeof paths} */ (name)] ?? paths.check}
      />
    </svg>
  );
}

/**
 * @param {{
 * children?: import('react').ReactNode,
 * onClick?: import('react').MouseEventHandler<HTMLButtonElement>,
 * variant?: 'primary'|'secondary'|'ghost'|'danger',
 * appearance?: 'default'|'sticker',
 * size?: 'compact'|'default'|'hero',
 * disabled?: boolean,
 * loading?: boolean,
 * leadingIcon?: import('react').ReactNode,
 * trailingIcon?: import('react').ReactNode,
 * fullWidth?: boolean,
 * type?: 'button'|'submit'|'reset',
 * className?: string,
 * 'aria-label'?: string,
 * 'aria-pressed'?: boolean,
 * 'aria-controls'?: string,
 * buttonRef?: import('react').Ref<HTMLButtonElement>,
 * }} props
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  appearance = 'default',
  size = 'default',
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  type = 'button',
  className = '',
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  'aria-controls': ariaControls,
  buttonRef,
}) {
  const classes = [
    'ck-button',
    `ck-button--${variant}`,
    appearance === 'sticker' && variant !== 'ghost' ? 'ck-button--sticker' : '',
    size !== 'default' ? `ck-button--${size}` : '',
    fullWidth ? 'ck-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={buttonRef}
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-pressed={ariaPressed}
      aria-controls={ariaControls}
      data-loading={loading || undefined}
    >
      {loading ? (
        <span className="ck-button__spinner" aria-hidden="true" />
      ) : null}
      <span
        className={`ck-button__content${loading ? ' ck-button__content--loading' : ''}`}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
}

/** @param {{name: string, label: string, title?: string, onClick?: import('react').MouseEventHandler<HTMLButtonElement>, pressed?: boolean, disabled?: boolean, type?: 'button'|'submit'|'reset', className?: string, buttonRef?: import('react').Ref<HTMLButtonElement>}} props */
export function IconButton({
  name,
  label,
  title = label,
  onClick,
  pressed,
  disabled,
  type = 'button',
  className = '',
  buttonRef,
}) {
  return (
    <button
      ref={buttonRef}
      type={type}
      className={`ck-icon-button ${className}`.trim()}
      aria-label={label}
      title={title}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
    </button>
  );
}
