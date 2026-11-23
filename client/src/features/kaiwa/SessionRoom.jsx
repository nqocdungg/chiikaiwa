import { useNavigate, useParams } from 'react-router';
import { useEffect } from 'react';
import { KaiwaRoom } from './KaiwaRoom.jsx';
import { useSessionRoom } from './use-session-room.js';
import { useSessionTools } from './use-session-tools.js';

export function SessionRoom() {
  const { sessionId = '' } = useParams();
  return <SessionRoomContent key={sessionId} sessionId={sessionId} />;
}

/** @param {{sessionId: string}} props */
function SessionRoomContent({ sessionId }) {
  const live = useSessionRoom(sessionId);
  const tools = useSessionTools({
    sessionId,
    cardId: live.session?.currentCard?.id,
    scenarioVersionId: live.session?.currentCard?.scenarioVersionId,
    deckVersionId: live.session?.deckVersionId,
  });
  const navigate = useNavigate();
  const { savePendingNote, getPendingNote } = tools;
  useEffect(() => {
    if (live.session?.status !== 'ended') return undefined;
    let active = true;
    void savePendingNote().then(() => {
      if (!active) return;
      navigate(`/sessions/${encodeURIComponent(sessionId)}/summary`, {
        replace: true,
        state: { sessionId, ...getPendingNote() },
      });
    });
    return () => {
      active = false;
    };
  }, [
    live.session?.status,
    navigate,
    sessionId,
    savePendingNote,
    getPendingNote,
  ]);
  return (
    <KaiwaRoom
      initialStage="selecting"
      initialPanel={null}
      longContent={false}
      initialNoteError={false}
      showDemoTools={false}
      onHome={() => navigate('/')}
      live={live}
      tools={tools}
    />
  );
}
