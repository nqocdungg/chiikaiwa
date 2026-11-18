import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ConnectionState } from 'livekit-client';
import { KaiwaRoom } from '../features/kaiwa/KaiwaRoom.jsx';
import * as demoData from './kaiwa-fixtures.js';

const previewData = {
  ...demoData,
  decks: [
    {
      title: 'Ở quán cà phê',
      japaneseTitle: 'カフェで',
      level: 'N5–N4',
      count: 8,
    },
    {
      title: 'Đời sống đại học',
      japaneseTitle: '大学生活',
      level: 'N4',
      count: 6,
    },
    {
      title: 'Việc làm thêm',
      japaneseTitle: 'アルバイト',
      level: 'N4–N3',
      count: 7,
    },
  ],
};
const states = [
  'connected',
  'preparing',
  'chat',
  'long-chat',
  'reconnecting',
  'device-error',
  'denied',
];

export function RoomPreview() {
  const [query, setQuery] = useSearchParams();
  const view = states.includes(query.get('state') ?? '')
    ? (query.get('state') ?? 'connected')
    : 'connected';
  return (
    <div className="ck-room-preview">
      {query.get('clean') !== '1' && (
        <div className="ck-room-preview-toolbar">
          <strong>Xem trước UI · Dữ liệu mẫu, không kết nối media thật</strong>
          <label>
            Trạng thái{' '}
            <select
              value={view}
              onChange={(event) => {
                query.set('state', event.target.value);
                setQuery(query);
              }}
            >
              {states.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <PreviewContent
        key={view}
        view={view}
        onView={(next) => {
          query.set('state', next);
          setQuery(query);
        }}
      />
    </div>
  );
}

/** @param {{view: string, onView: (view: string) => void}} props */
function PreviewContent({ view, onView }) {
  const navigate = useNavigate();
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [messages, setMessages] = useState(
    view === 'long-chat'
      ? Array.from({ length: 25 }, (_, index) => ({
          id: String(index),
          sender: index % 2 ? 'user:a' : 'user:b',
          text: 'こんにちは。もう一度お願いします。'.repeat(10),
        }))
      : [
          { id: '1', sender: 'user:b', text: 'よろしくお願いします！' },
          {
            id: '2',
            sender: 'user:a',
            text: 'こちらこそ、よろしくお願いします。',
          },
        ],
  );
  const member = {
    getTrackPublication: () => undefined,
    isCameraEnabled: false,
    isMicrophoneEnabled: true,
  };
  const media = {
    room: {
      state:
        view === 'reconnecting'
          ? ConnectionState.Reconnecting
          : ConnectionState.Connected,
      localParticipant: {
        ...member,
        identity: 'user:a',
        isCameraEnabled: camera,
        isMicrophoneEnabled: mic,
      },
      remoteParticipants: new Map(
        view === 'reconnecting' ? [] : [['user:b', member]],
      ),
      canPlaybackAudio: true,
    },
    pendingDevices: new Set(),
    deviceErrors: new Map(
      view === 'device-error'
        ? [
            [
              'camera',
              'Trình duyệt từ chối camera. Bạn vẫn có thể chat và rời phòng.',
            ],
          ]
        : [],
    ),
    async setDevice(
      /** @type {'microphone'|'camera'} */ device,
      /** @type {boolean} */ enabled,
    ) {
      if (device === 'camera') setCamera(enabled);
      else setMic(enabled);
    },
    async send(/** @type {string} */ text) {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), sender: 'user:a', text },
      ]);
    },
  };
  /** @type {ReturnType<typeof import('../features/kaiwa/use-session-room.js').useSessionRoom>} */
  const live = {
    session:
      view === 'denied'
        ? null
        : {
            id: 'preview',
            status:
              view === 'preparing'
                ? 'preparing'
                : view === 'reconnecting'
                  ? 'reconnecting'
                  : 'active',
            version: 1,
            members: [
              { actorKey: 'user:a', displayName: 'Minh Anh' },
              { actorKey: 'user:b', displayName: 'An Nhiên' },
            ],
            controllerKey: 'user:a',
            activeDurationMs: 78000,
            selectionRemainingMs: 45000,
          },
    media:
      view === 'preparing' || view === 'denied'
        ? null
        : /** @type {any} */ (media),
    messages,
    error: view === 'denied' ? 'Quyền truy cập phiên đã hết hạn.' : '',
    mediaError: '',
    accessDenied: view === 'denied',
    connecting: false,
    leaving: false,
    connect: async () => onView('connected'),
    leave: async () => onView('denied'),
    refresh: () => {},
  };
  return (
    <div className="ck-app ck-app--room ck-room-view">
      <div className="ck-room-route">
        <KaiwaRoom
          initialStage="selecting"
          initialPanel={['chat', 'long-chat'].includes(view) ? 'chat' : null}
          longContent={false}
          initialNoteError={false}
          showDemoTools={false}
          onHome={() => navigate('/__dev/components')}
          live={live}
          demoData={previewData}
        />
      </div>
    </div>
  );
}
