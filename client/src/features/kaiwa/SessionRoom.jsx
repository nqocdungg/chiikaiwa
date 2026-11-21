import { useNavigate, useParams } from 'react-router';
import { useEffect } from 'react';
import { KaiwaRoom } from './KaiwaRoom.jsx';
import { useSessionRoom } from './use-session-room.js';

export function SessionRoom() {
  const { sessionId = '' } = useParams();
  return <SessionRoomContent key={sessionId} sessionId={sessionId} />;
}

/** @param {{sessionId: string}} props */
function SessionRoomContent({ sessionId }) {
  const live = useSessionRoom(sessionId);
  const navigate = useNavigate();
  useEffect(() => {
    if (live.session?.status === 'ended')
      navigate(`/sessions/${encodeURIComponent(sessionId)}/summary`, {
        replace: true,
      });
  }, [live.session?.status, navigate, sessionId]);
  return (
    <KaiwaRoom
      initialStage="selecting"
      initialPanel={null}
      longContent={false}
      initialNoteError={false}
      showDemoTools={false}
      onHome={() => navigate('/')}
      live={live}
    />
  );
}
