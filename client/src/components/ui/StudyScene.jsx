// Lucian UX/UI Prompt #012 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#012
import { useState } from 'react';
import studyScene from '../../assets/mascots/study-scene.webp';
import './study-scene.css';

const greetings = [
  { japanese: 'こんにちは！', vietnamese: 'Chào bạn!' },
  { japanese: 'やっほー！', vietnamese: 'Chào nha!' },
  { japanese: 'おかえり！', vietnamese: 'Mừng bạn trở lại!' },
];

export function StudyScene() {
  const [turn, setTurn] = useState(0);
  const greeting = greetings[turn % greetings.length];

  return (
    <div className="ck-home-scene u012">
      <div className="ck-home-greeting" aria-live="polite">
        <svg
          className="ck-home-greeting__outline"
          viewBox="0 0 260 110"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M130 3C200 3 257 22 257 50c0 29-56 51-127 51-20 0-38-2-54-6-9 7-16 10-23 11 4-5 5-10 4-15C24 81 3 67 3 50 3 22 60 3 130 3Z" />
        </svg>
        <strong lang="ja">{greeting.japanese}</strong>
        <span>{greeting.vietnamese}</span>
      </div>
      <button
        className="ck-home-friends-button"
        type="button"
        aria-label="Đổi lời chào của mascot"
        onClick={() => setTurn((current) => current + 1)}
      >
        <img
          className="ck-home-friends"
          src={studyScene}
          alt=""
          width="1440"
          height="720"
        />
      </button>
      {turn > 0 && (
        <span key={turn} className="u012-confetti" aria-hidden="true">
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
          <span className="u012-p" />
        </span>
      )}
    </div>
  );
}
