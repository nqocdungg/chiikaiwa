import './greeting-bubble.css';

/** @param {{japanese: string, translation: string, className?: string}} props */
export function GreetingBubble({ japanese, translation, className = '' }) {
  return (
    <div className={`ck-greeting-bubble ${className}`.trim()}>
      <svg
        className="ck-greeting-bubble__shape"
        viewBox="0 0 360 148"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <ellipse cx="180" cy="74" rx="177" ry="70" />
        <ellipse cx="322" cy="132" rx="17" ry="13" />
        <ellipse cx="348" cy="150" rx="10" ry="8" />
      </svg>
      <svg
        className="ck-greeting-bubble__flower"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path
          d="M16 7c3-8 11-5 10 2 7 1 7 9 1 11 3 7-5 12-10 7-5 5-12 0-10-6-7-2-6-10 1-12 0-5 5-7 8-2Z"
          fill="#ffafc7"
          stroke="#f56695"
          strokeWidth="2"
        />
        <path
          d="M16 11v11m-5-8 10 5m0-5-10 5"
          stroke="#fff8f4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="ck-greeting-bubble__star"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="m12 3 2.9 5.7 6.4.9-4.6 4.5 1.1 6.3-5.8-3-5.8 3 1.1-6.3-4.6-4.5 6.4-.9Z"
          fill="#ffdb82"
          stroke="#ac7050"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
      <strong lang="ja">{japanese}</strong>
      <span>{translation}</span>
    </div>
  );
}
