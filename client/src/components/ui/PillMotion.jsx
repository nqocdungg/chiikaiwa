import { useLayoutEffect, useRef } from 'react';
import './pill-motion.css';

const selectedTab =
  ':scope > :is([aria-current="page"], [aria-selected="true"], [aria-pressed="true"])';

/** @param {HTMLElement} pill @param {DOMRect} from @param {DOMRect} to */
function slidePill(pill, from, to) {
  const x = from.x + from.width / 2 - to.x - to.width / 2;
  const y = from.y - to.y;
  const stretch = 1 + Math.min(Math.hypot(x, y) / 280, 0.28);

  return pill.animate(
    [
      {
        transform: `translate(${x}px, ${y}px) scaleX(${from.width / to.width})`,
        easing: 'cubic-bezier(.22,.7,.35,1)',
      },
      {
        transform: `translate(${x * 0.3}px, ${y * 0.3}px) scaleX(${stretch})`,
        offset: 0.42,
        easing: 'ease-out',
      },
      {
        transform: `translate(${-x * 0.025}px, ${-y * 0.025}px) scaleX(.97)`,
        offset: 0.76,
      },
      { transform: 'none' },
    ],
    430,
  );
}

/** @param {HTMLElement} tab @param {HTMLElement} bubbles */
function celebrateTab(tab, bubbles) {
  const icon = tab.querySelector('[data-pill-icon], svg');
  const animations = [];

  if (icon) {
    animations.push(
      icon.animate(
        [
          { translate: '0 2px', opacity: 0.75 },
          {
            translate: '0 -7px',
            filter: 'drop-shadow(0 0 4px white) drop-shadow(0 0 8px white)',
            opacity: 1,
            offset: 0.4,
          },
          { translate: '0 0', filter: 'none', opacity: 1 },
        ],
        { duration: 420, easing: 'ease-out' },
      ),
    );
  }

  for (const [index, bubble] of Array.from(bubbles.children).entries()) {
    const drift = (index - 1) * 21;
    const rise = index === 1 ? 44 : 32;
    animations.push(
      bubble.animate(
        [
          { transform: 'translate(0, 0) scale(.45)', opacity: 0 },
          { opacity: 1, offset: 0.18 },
          {
            transform: `translate(${drift}px, ${-rise}px) scale(1.15)`,
            opacity: 1,
            offset: 0.78,
          },
          {
            transform: `translate(${drift}px, ${-rise - 3}px) scale(1.45)`,
            opacity: 0,
          },
        ],
        { duration: 520, delay: index * 32, easing: 'ease-out' },
      ),
    );
  }

  return animations;
}

export function PillMotion() {
  const pillRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const bubblesRef = useRef(/** @type {HTMLSpanElement | null} */ (null));

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const bubbles = bubblesRef.current;
    const group = pill?.parentElement;
    if (!pill || !group || !bubbles) return;

    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    );
    /** @type {HTMLElement | null} */
    let previous = null;
    let initialized = false;
    /** @type {Animation[]} */
    let animations = [];
    const cancelAnimations = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };

    const update = () => {
      const tab = group.querySelector(selectedTab);
      if (!(tab instanceof HTMLElement) || !tab.offsetWidth) {
        cancelAnimations();
        pill.hidden = true;
        previous = null;
        return;
      }

      const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = tab;
      const position = {
        left: `${offsetLeft}px`,
        top: `${offsetTop}px`,
        width: `${offsetWidth}px`,
        height: `${offsetHeight}px`,
      };
      if (
        tab === previous &&
        Object.entries(position).every(
          ([key, value]) => pill.style.getPropertyValue(key) === value,
        )
      ) {
        return;
      }

      const from = pill.hidden ? null : pill.getBoundingClientRect();
      cancelAnimations();
      Object.assign(pill.style, position);
      pill.hidden = false;
      if (
        initialized &&
        tab !== previous &&
        !reduceMotion?.matches &&
        typeof pill.animate === 'function'
      ) {
        bubbles.style.left = `${offsetLeft + offsetWidth / 2}px`;
        bubbles.style.top = `${offsetTop + offsetHeight / 2}px`;
        animations = celebrateTab(tab, bubbles);
        if (from)
          animations.push(slidePill(pill, from, pill.getBoundingClientRect()));
      }
      previous = tab;
    };

    const sizes =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const observeTabs = () => {
      sizes?.disconnect();
      sizes?.observe(group);
      for (const child of group.children) {
        if (child.matches('a, button, [role="tab"]')) sizes?.observe(child);
      }
      update();
    };
    const selection = new MutationObserver((changes) => {
      if (
        changes.some(
          (change) => change.type === 'childList' && change.target === group,
        )
      ) {
        observeTabs();
      } else {
        update();
      }
    });
    selection.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current', 'aria-selected', 'aria-pressed'],
    });
    observeTabs();
    initialized = true;
    reduceMotion?.addEventListener('change', cancelAnimations);

    return () => {
      cancelAnimations();
      selection.disconnect();
      sizes?.disconnect();
      reduceMotion?.removeEventListener('change', cancelAnimations);
    };
  }, []);

  return (
    <>
      <span
        ref={pillRef}
        className="ck-motion-pill"
        hidden
        aria-hidden="true"
      />
      <span ref={bubblesRef} className="ck-motion-bubbles" aria-hidden="true">
        <span className="ck-motion-bubble" />
        <span className="ck-motion-bubble" />
        <span className="ck-motion-bubble" />
      </span>
    </>
  );
}
