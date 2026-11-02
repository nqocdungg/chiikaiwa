/** @param {{name: string, size?: number}} props */
export function Icon({ name, size = 20 }) {
  const paths = {
    home: 'm3 10 9-7 9 7v10H3Z M9 20v-7h6v7',
    book: 'M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15',
    chat: 'M4 4h16v12H9l-5 4Z M8 8h8 M8 12h5',
    cards: 'm8 3 13 3-4 15-13-3Z M3 5 1 18l3 1',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
    mic: 'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Zm-3 6v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8',
    camera: 'M3 6h12v12H3Z m12 4 6-4v12l-6-4',
    screen: 'M3 3h18v14H3Z M12 17v4 M7 21h10',
    exit: 'M9 4H3v16h6 M9 12h12 m-5-5 5 5-5 5',
    note: 'M5 3h14v18H5Z M8 8h8 M8 12h8 M8 16h5',
    star: 'm12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z',
    check: 'm5 12 4 4L19 6',
    lock: 'M5 10h14v11H5Z M8 10V6a4 4 0 0 1 8 0v4',
    clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    swap: 'M4 7h16 m-4-4 4 4-4 4 M20 17H4 m4-4-4 4 4 4',
    close: 'm5 5 14 14 M19 5 5 19',
    translate:
      'M3 5h12 M9 2v3 M5 8c1 4 4 7 8 9 M12 5c0 5-3 9-8 12 M14 21l4-11 4 11 M16 17h4',
  };
  return (
    <svg
      width={size}
      height={size}
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

/** @param {{children: import('react').ReactNode, onClick?: () => void, variant?: 'primary'|'secondary'|'danger', disabled?: boolean}} props */
export function Button({ children, onClick, variant = 'secondary', disabled }) {
  return (
    <button
      type="button"
      className={`ck-button ck-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** @param {{name: string, label: string, onClick: () => void, pressed?: boolean, disabled?: boolean}} props */
export function IconButton({ name, label, onClick, pressed, disabled }) {
  return (
    <button
      type="button"
      className="ck-icon-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
    </button>
  );
}
