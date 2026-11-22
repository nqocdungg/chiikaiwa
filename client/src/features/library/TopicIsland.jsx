import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '../../components/ui/controls.jsx';
import terrain from './assets/island-coast.webp';
import explorer from './assets/island-explorer.webp';
import { IslandPagination } from './IslandPagination.jsx';
import { topicIllustration } from './topic-illustrations.js';

const width = 1600;
const height = 560;
const trail =
  'M 314 528 C 215 532 148 464 173 398 C 191 346 239 292 307 288 C 502 278 613 301 802 289 C 985 278 1120 290 1301 288 C 1390 286 1444 367 1429 419 C 1411 482 1361 523 1264 527 C 1045 534 926 523 783 527 C 590 526 460 533 314 528 Z';
const footprints = [
  [169, 426, -56],
  [195, 363, -38],
  [247, 302, -18],
  [326, 288, -6],
  [449, 286, 0],
  [578, 290, 8],
  [703, 292, 0],
  [838, 287, -8],
  [984, 283, 2],
  [1142, 288, 5],
  [1284, 288, 0],
  [1384, 322, 32],
  [1423, 434, 115],
  [1356, 506, 153],
  [1253, 528, 178],
  [1068, 531, 180],
  [916, 528, 183],
  [727, 528, 178],
  [567, 529, 170],
  [403, 530, 165],
];
const stations = [
  { x: 34, y: 16, checkpoint: 0.2 },
  { x: 72, y: 15, checkpoint: 0.43 },
  { x: 73, y: 54, checkpoint: 0.65 },
  { x: 41, y: 51, checkpoint: 0.87 },
];
const groupSize = stations.length;

/**
 * @param {{
 * topics: import('./library-api.js').Topic[],
 * pending?: boolean,
 * hasMore?: boolean,
 * loadMore?: () => void,
 * clearFilters?: () => void,
 * showSuggestions?: boolean,
 * hasLoadError?: boolean,
 * }} props
 */
export function TopicIsland({
  topics,
  pending = false,
  hasMore = false,
  loadMore,
  clearFilters,
  showSuggestions = false,
  hasLoadError = false,
}) {
  const navigate = useNavigate();
  const [journey, setJourney] = useState({
    index: 0,
    action: 0,
    direction: 1,
    destination: /** @type {string|null} */ (null),
  });
  const openDestination = useCallback(() => {
    if (journey.destination) void navigate(journey.destination);
  }, [journey.destination, navigate]);
  const activeIndex = Math.min(journey.index, topics.length - 1);
  const active = topics[activeIndex];
  if (!active) return null;

  const page = Math.floor(activeIndex / groupSize);
  const pageCount = Math.ceil(topics.length / groupSize);
  const start = page * groupSize;
  const visible = topics.slice(start, start + groupSize);
  const waitingForPage = pending && journey.index >= topics.length;

  /** @param {number} index @param {number} [direction] @param {string|null} [destination] */
  function visit(index, direction = 0, destination = null) {
    setJourney((previous) => ({
      index,
      action: previous.action + 1,
      direction: direction || previous.direction,
      destination,
    }));
  }

  /** @param {number} target */
  function goToPage(target) {
    if (target === page || pending) return;
    visit(target * groupSize, target > page ? 1 : -1);
  }

  /** @param {-1 | 1} direction */
  function turn(direction) {
    if (pending) return;
    if (direction > 0 && page === pageCount - 1 && hasMore) {
      visit(topics.length, direction);
      loadMore?.();
      return;
    }
    if (pageCount > 1) {
      const target = (page + direction + pageCount) % pageCount;
      visit(target * groupSize, direction);
      return;
    }
    visit((activeIndex + direction + topics.length) % topics.length, direction);
  }

  function pickRandom() {
    const count = topics.length;
    if (count < 2) return;
    const index =
      (activeIndex + 1 + Math.floor(Math.random() * (count - 1))) % count;
    visit(index, index > activeIndex ? 1 : -1);
  }

  return (
    <section className="ck-topic-island" aria-label="Đảo chủ đề">
      <div className="ck-island-stage">
        <div className="ck-island-canvas">
          <img className="ck-island-coast" src={terrain} alt="" />
        </div>
        <IslandWalker
          checkpoint={
            journey.action ? stations[activeIndex - start].checkpoint : 0
          }
          action={journey.action}
          onArrive={journey.destination ? openDestination : undefined}
        />
        <div
          className="ck-island-stations"
          key={page}
          data-entering={journey.direction}
        >
          {visible.map((topic, index) => {
            const to = `/topics/${encodeURIComponent(topic.versionId)}`;
            return (
              <div
                className="ck-island-station"
                key={topic.id}
                style={{
                  left: `${stations[index].x}%`,
                  top: `${stations[index].y}%`,
                }}
              >
                <img src={topicIllustration(topic.id)} alt="" />
                <div
                  className="ck-island-station__actions"
                  data-visited={
                    (journey.action > 0 && topic.id === active.id) || undefined
                  }
                >
                  <h3 aria-label={topic.title}>
                    <Link
                      className="ck-island-station__sign"
                      aria-label={`Xem học liệu: ${topic.title}`}
                      aria-busy={journey.destination === to || undefined}
                      title={topic.title}
                      to={to}
                      onClick={(event) => {
                        if (
                          event.defaultPrevented ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.altKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          window.matchMedia?.(
                            '(prefers-reduced-motion: reduce)',
                          ).matches
                        )
                          return;
                        event.preventDefault();
                        visit(start + index, 0, to);
                      }}
                    >
                      <span className="ck-island-station__label">
                        {topic.title}
                      </span>
                      <span
                        className="ck-island-station__open"
                        aria-hidden="true"
                      >
                        <Icon name="chevronRight" size={19} />
                      </span>
                    </Link>
                  </h3>
                </div>
              </div>
            );
          })}
        </div>
        <button
          className="ck-island-turn ck-island-turn--previous"
          type="button"
          disabled={pending || (topics.length === 1 && !hasMore)}
          onClick={() => turn(-1)}
          aria-label="Nhóm chủ đề trước"
        >
          <Icon name="chevronLeft" size={35} />
        </button>
        <button
          className="ck-island-turn ck-island-turn--next"
          type="button"
          disabled={pending || (topics.length === 1 && !hasMore)}
          onClick={() => turn(1)}
          aria-label="Nhóm chủ đề tiếp theo"
        >
          <Icon name="chevronRight" size={35} />
        </button>
      </div>
      <IslandPagination
        page={page}
        count={pageCount}
        direction={journey.direction}
        onChange={goToPage}
        disabled={pending}
      />
      {waitingForPage && (
        <p className="ck-island-visually-hidden" role="status">
          Đang tải thêm chủ đề…
        </p>
      )}
      {showSuggestions && (
        <div className="ck-island-suggestions">
          <span className="ck-island-suggestions__title">
            <Icon name="flag" /> Gợi ý cho bạn
          </span>
          <button
            className="ck-island-pill"
            type="button"
            onClick={clearFilters ?? (() => visit(0, -1))}
          >
            <Icon name="book" /> Tất cả chủ đề
          </button>
          <button
            className="ck-island-pill"
            type="button"
            onClick={() => visit(0, -1)}
          >
            <Icon name="sprout" /> Chủ đề mới
          </button>
          <button
            className="ck-island-pill"
            type="button"
            disabled={topics.length < 2}
            onClick={pickRandom}
          >
            <Icon name="dice" /> Ngẫu nhiên
          </button>
        </div>
      )}
      {hasLoadError && (
        <button
          className="ck-island-pill ck-island-retry"
          type="button"
          onClick={loadMore}
        >
          Thử tải lại chủ đề
        </button>
      )}
    </section>
  );
}

/** @param {{checkpoint: number, action: number, onArrive?: () => void}} props */
function IslandWalker({ checkpoint, action, onArrive }) {
  const pathRef = useRef(/** @type {SVGPathElement|null} */ (null));
  const walkerRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const progress = useRef(0);

  useEffect(() => {
    const path = pathRef.current;
    const walker = walkerRef.current;
    if (!path?.getTotalLength || !walker) {
      onArrive?.();
      return;
    }
    const length = path.getTotalLength();
    const start = progress.current;
    const forward = (checkpoint - start + 1) % 1;
    const distance = forward > 0.5 ? forward - 1 : forward;
    const duration = 340 + Math.abs(distance) * 1850;
    let frame = 0;
    let arrival = 0;

    /** @param {number} position */
    function pointAt(position) {
      return path?.getPointAtLength((((position % 1) + 1) % 1) * length);
    }

    /** @param {number} position */
    function draw(position) {
      const point = pointAt(position);
      if (!point || !walker) return;
      const ahead = pointAt(position + Math.sign(distance) * 0.008);
      walker.style.left = `${(point.x / width) * 100}%`;
      walker.style.top = `${(point.y / height) * 100}%`;
      if (ahead && Math.abs(ahead.x - point.x) > 1) {
        walker.style.setProperty(
          '--walker-facing',
          ahead.x < point.x ? '-1' : '1',
        );
      }
      progress.current = ((position % 1) + 1) % 1;
    }

    if (
      !action ||
      Math.abs(distance) < 0.002 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      draw(checkpoint);
      onArrive?.();
      return;
    }

    const started = performance.now();
    walker.dataset.pose = 'walk';

    /** @param {number} now */
    function step(now) {
      const elapsed = Math.min(1, (now - started) / duration);
      draw(start + distance * elapsed);
      if (elapsed < 1) frame = requestAnimationFrame(step);
      else if (walker) {
        walker.dataset.pose = 'arrive';
        if (onArrive) arrival = window.setTimeout(onArrive, 160);
      }
    }

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(arrival);
      delete walker.dataset.pose;
    };
  }, [action, checkpoint, onArrive]);

  return (
    <>
      <div className="ck-island-trail-layer">
        <svg
          className="ck-island-trail"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="ck-island-trail__edge" d={trail} />
          <path className="ck-island-trail__road" d={trail} ref={pathRef} />
          <g className="ck-island-trail__tracks">
            {footprints.map(([x, y, tilt]) => (
              <g key={x} transform={`translate(${x} ${y}) rotate(${tilt})`}>
                <ellipse cy="2" rx="4.4" ry="3.2" />
                <circle cx="-4.5" cy="-2.5" r="1.8" />
                <circle cy="-3.9" r="1.9" />
                <circle cx="4.5" cy="-2.5" r="1.8" />
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="ck-island-walker-layer">
        <div className="ck-island-walker" ref={walkerRef} aria-hidden="true">
          <div className="ck-island-walker__body">
            <span className="ck-island-walker__dust">˙ ˚</span>
            <img src={explorer} alt="" />
            <span className="ck-island-walker__frames" />
            <span className="ck-island-walker__sparkles">
              ✦ <small>✧</small>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
