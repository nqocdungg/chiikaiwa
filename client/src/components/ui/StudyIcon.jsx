/** @param {{name: 'chat' | 'invite' | 'join' | 'arrow' | 'chevron', size?: number}} props */
export function StudyIcon({ name, size = 22 }) {
  const stickers = {
    chat: (
      <>
        <path
          fill="#f6a8c4"
          d="M24 5c6 0 10 3.5 10 8 0 2.4-1 4.2-3 5.8l.7 3-4.7-1.3c-1 .3-2 .5-3 .5-5.7 0-10-3.5-10-8s4.3-8 10-8Z"
        />
        <path
          fill="#fff2d5"
          d="M15 13c6.8 0 12 4 12 9s-5.2 9-12 9c-1 0-2.3-.1-3.2-.5l-5 2 .9-4C4.7 26.8 3 24.7 3 22c0-5 5.2-9 12-9Z"
        />
        <path d="M22 11h.1m5 0h.1M10 22h.1m9 0h.1m-6 2.2c.7 1.3 2.1 1.3 3 0" />
        <path stroke="#e9889e" d="M7.5 24.5h.8m12.8 0h.8" />
      </>
    ),
    invite: (
      <g transform="rotate(-13 18 18)">
        <path
          fill="#f5a3b8"
          d="M5 9h26v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6Z"
        />
        <path stroke="#a94866" strokeDasharray="1 3" d="M11 11v14" />
        <path
          fill="#fff3cc"
          d="m22 13 1.5 3.1 3.5.5-2.5 2.4.6 3.5-3.1-1.6-3.1 1.6.6-3.5-2.5-2.4 3.5-.5Z"
        />
      </g>
    ),
    join: (
      <g transform="rotate(-9 18 18)">
        <rect x="5" y="8" width="23" height="24" rx="5" fill="#e7a8c2" />
        <path fill="#a9d0e7" d="M12 9V6h3a2.5 2.5 0 0 1 5 0h3v3Z" />
        <rect
          x="8"
          y="13"
          width="17"
          height="13"
          rx="3"
          fill="#fff9ec"
          stroke="none"
        />
        <path d="m11 17 3 4m0-4-3 4m7-4 3 4m0-4-3 4" />
        <path fill="#ffd270" d="m23 29 6-12 4 2-6 12-4 2Z" />
      </g>
    ),
  };

  if (name === 'arrow' || name === 'chevron') {
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
        <path
          d={
            name === 'arrow'
              ? 'M5.5 12h12.8m-4.6-4.6 4.6 4.6-4.6 4.6'
              : 'm9.5 6.5 5.5 5.5-5.5 5.5'
          }
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      stroke="#673443"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ck-home-glyph ck-home-glyph--sticker"
    >
      {stickers[name]}
    </svg>
  );
}
