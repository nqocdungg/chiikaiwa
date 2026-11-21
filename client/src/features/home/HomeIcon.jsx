const shapes = {
  chat: 'M5 15.2a6 6 0 0 1-1.6-4.1c0-3.5 3.8-6.3 8.6-6.3s8.6 2.8 8.6 6.3-3.8 6.3-8.6 6.3c-.9 0-1.8-.1-2.6-.3l-3.8 2 .6-2.8L5 15.2Zm3.6-4.1h.1m3.3 0h.1m3.3 0h.1',
  invite:
    'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v2a3 3 0 0 0 0 6v2A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Zm5 4.5v6m-3-3h6',
  join: 'M12.5 5h4A3 3 0 0 1 19.5 8v8a3 3 0 0 1-3 3h-4M4 12h9.5m-4-4 4 4-4 4',
  arrow: 'M5.5 12h12.8m-4.6-4.6 4.6 4.6-4.6 4.6',
  chevron: 'm9.5 6.5 5.5 5.5-5.5 5.5',
};

/** @param {{name: keyof typeof shapes, size?: number}} props */
export function HomeIcon({ name, size = 20 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ck-home-glyph"
    >
      <path d={shapes[name]} />
    </svg>
  );
}
