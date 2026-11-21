// Lucian UX/UI Prompt #012 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#012
import { useState } from 'react';
import studyScene from './study-scene.webp';
import './home-mascot.css';

const greetings = [
  { japanese: 'こんにちは！', vietnamese: 'Chào bạn!' },
  { japanese: 'やっほー！', vietnamese: 'Chào nha!' },
  { japanese: 'おかえり！', vietnamese: 'Mừng bạn trở lại!' },
];

export function HomeMascot() {
  const [turn, setTurn] = useState(0);
  const greeting = greetings[turn % greetings.length];

  return (
    <div className="ck-home-scene u012">
      <div className="ck-home-greeting" aria-live="polite">
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
