import { useState } from 'react';
import { islandAsset } from './topic-art.js';
import './island-waterfront.css';

/** @param {{page: number|null}} props */
export function IslandWaterfront({ page }) {
  const [turn, setTurn] = useState({ page, number: 0 });
  if (turn.page !== page) {
    setTurn({
      page,
      number: turn.page === null || page === null ? 0 : turn.number + 1,
    });
  }
  const reacting = turn.number > 0;

  return (
    <div className="ck-waterfront" aria-hidden="true">
      <span className="ck-waterfront__wave ck-waterfront__wave--left" />
      <span className="ck-waterfront__wave ck-waterfront__wave--middle" />
      <span className="ck-waterfront__wave ck-waterfront__wave--right" />
      <div className="ck-waterfront__boat">
        <div className="ck-waterfront__float">
          <div
            key={turn.number}
            className="ck-waterfront__stroke"
            data-rowing={reacting || undefined}
          >
            <span className="ck-waterfront__oar ck-waterfront__oar--left" />
            <span className="ck-waterfront__oar ck-waterfront__oar--right" />
            <img src={islandAsset('rowboat')} alt="" width="360" height="285" />
          </div>
        </div>
      </div>
      <div className="ck-waterfront__pier">
        <img
          className="ck-waterfront__dock"
          src={islandAsset('fishing-dock')}
          alt=""
          width="340"
          height="243"
        />
        <div
          key={turn.number}
          className="ck-waterfront__fishing"
          data-reeling={reacting || undefined}
        >
          <img
            className="ck-waterfront__angler"
            src={islandAsset('fishing-mascot')}
            alt=""
            width="178"
            height="190"
          />
          <div className="ck-waterfront__rod">
            <span className="ck-waterfront__line">
              {!reacting ? null : (
                <img
                  className="ck-waterfront__catch"
                  data-testid="island-catch"
                  src={islandAsset('fishing-catch')}
                  alt=""
                  width="100"
                  height="56"
                />
              )}
            </span>
          </div>
          <span className="ck-waterfront__ripples" />
        </div>
      </div>
    </div>
  );
}
