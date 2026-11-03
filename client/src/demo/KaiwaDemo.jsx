import { useState } from 'react';
import { Home } from '../features/home/Home.jsx';
import { KaiwaRoom } from '../features/kaiwa/KaiwaRoom.jsx';

/** @param {{initialScreen?: 'home'|'room', initialStage?: import('./kaiwa-fixtures.js').Stage, initialPanel?: import('./kaiwa-fixtures.js').Panel|null, longContent?: boolean, initialNoteError?: boolean, showDemoTools?: boolean}} props */
export function KaiwaDemo({
  initialScreen = 'home',
  initialStage = 'practice',
  initialPanel = 'hints',
  longContent = false,
  initialNoteError = false,
  showDemoTools = true,
}) {
  const [screen, setScreen] = useState(initialScreen);
  const [entryStage, setEntryStage] = useState(initialStage);
  return (
    <div className={`ck-app ${screen === 'room' ? 'ck-app--room' : ''}`}>
      {screen === 'home' ? (
        <Home
          onStart={() => {
            setEntryStage('selecting');
            setScreen('room');
          }}
        />
      ) : (
        <KaiwaRoom
          initialStage={entryStage}
          initialPanel={initialPanel}
          longContent={longContent}
          initialNoteError={initialNoteError}
          showDemoTools={showDemoTools}
          onHome={() => setScreen('home')}
        />
      )}
    </div>
  );
}
