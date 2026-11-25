import { ConnectionState, Room, RoomEvent } from 'livekit-client';

const CHAT_TOPIC = 'chiikaiwa.chat.v1';
const MAX_PACKET_BYTES = 15000;

/** Owns one SDK room; business state remains in the Session API.
 * @param {{sessionId: string, memberKeys: string[], onChange: () => void, onMessage: (message: {id: string, sender: string, text: string}) => void, onSessionUpdate: (version: number) => void, onReconnect?: () => void, room?: Room}} options */
export function createMediaRoom({
  sessionId,
  memberKeys,
  onChange,
  onMessage,
  onSessionUpdate,
  onReconnect,
  room = new Room(),
}) {
  let disposed = false;
  let generation = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  /** @type {Set<string>} */
  const pendingDevices = new Set();
  /** @type {Map<string, string>} */
  const deviceErrors = new Map();
  /** @type {Array<() => void>} */
  const cleanups = [];
  /** @param {keyof import('livekit-client').RoomEventCallbacks} event @param {(...args: any[]) => void} listener */
  function listen(event, listener) {
    room.on(event, listener);
    cleanups.push(() => room.off(event, listener));
  }
  function changed() {
    if (!disposed) onChange();
  }
  if (onReconnect) listen(RoomEvent.Reconnected, onReconnect);
  for (const event of [
    RoomEvent.ConnectionStateChanged,
    RoomEvent.ParticipantConnected,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished,
    RoomEvent.MediaDevicesChanged,
    RoomEvent.AudioPlaybackStatusChanged,
  ])
    listen(event, changed);
  listen(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (disposed || payload.byteLength > MAX_PACKET_BYTES) return;
    try {
      if (!participant && !topic) {
        const notice = JSON.parse(decoder.decode(payload));
        if (
          notice.type === 'session.updated' &&
          notice.sessionId === sessionId &&
          Number.isInteger(notice.version)
        )
          onSessionUpdate(notice.version);
      } else if (
        topic === CHAT_TOPIC &&
        participant &&
        memberKeys.includes(participant.identity)
      ) {
        const message = JSON.parse(decoder.decode(payload));
        if (
          message.sessionId === sessionId &&
          typeof message.id === 'string' &&
          message.id.length <= 100 &&
          typeof message.text === 'string' &&
          message.text.trim()
        )
          onMessage({
            id: `${participant.identity}:${message.id}`,
            sender: participant.identity,
            text: message.text,
          });
      }
    } catch {
      /* Ignore foreign or malformed data packets. */
    }
  });
  function detachTracks() {
    for (const participant of [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ]) {
      for (const publication of participant.trackPublications.values())
        publication.track?.detach();
    }
  }
  return {
    room,
    pendingDevices,
    deviceErrors,
    /** @param {{url: string, token: string}} credentials */
    async connect({ url, token }) {
      const attempt = ++generation;
      await room.connect(url, token);
      if (disposed || attempt !== generation) {
        await room.disconnect(true);
        return;
      }
      if (!memberKeys.includes(room.localParticipant.identity)) {
        await room.disconnect(true);
        throw new Error('Danh tính media không thuộc phiên này.');
      }
      changed();
    },
    /** @param {'microphone'|'camera'} device @param {boolean} enabled */
    async setDevice(device, enabled) {
      if (
        disposed ||
        pendingDevices.has(device) ||
        room.state !== ConnectionState.Connected
      )
        return;
      pendingDevices.add(device);
      deviceErrors.delete(device);
      changed();
      try {
        if (device === 'camera')
          await room.localParticipant.setCameraEnabled(enabled);
        else await room.localParticipant.setMicrophoneEnabled(enabled);
        if (disposed) await room.disconnect(true);
      } catch (error) {
        const name =
          error && typeof error === 'object' && 'name' in error
            ? error.name
            : '';
        deviceErrors.set(
          device,
          name === 'NotAllowedError' || name === 'PermissionDeniedError'
            ? 'Trình duyệt từ chối thiết bị. Kiểm tra quyền ở thanh địa chỉ; bạn vẫn có thể chat và rời phòng.'
            : name === 'NotFoundError' || name === 'DevicesNotFoundError'
              ? 'Không tìm thấy thiết bị. Bạn vẫn có thể tiếp tục không mic/camera.'
              : 'Không bật được thiết bị. Kiểm tra thiết bị đang được ứng dụng khác sử dụng.',
        );
      } finally {
        pendingDevices.delete(device);
        changed();
      }
    },
    /** @param {string} text */
    async send(text) {
      if (disposed || room.state !== ConnectionState.Connected)
        throw new Error('Chưa kết nối chat.');
      if (typeof text !== 'string' || !text.trim())
        throw new Error('Hãy nhập tin nhắn văn bản.');
      const message = { sessionId, id: crypto.randomUUID(), text };
      const payload = encoder.encode(JSON.stringify(message));
      if (payload.byteLength > MAX_PACKET_BYTES)
        throw new Error('Tin nhắn quá dài để gửi qua kênh chat.');
      await room.localParticipant.publishData(payload, {
        reliable: true,
        topic: CHAT_TOPIC,
        destinationIdentities: memberKeys.filter(
          (key) => key !== room.localParticipant.identity,
        ),
      });
      if (!disposed)
        onMessage({
          id: `${room.localParticipant.identity}:${message.id}`,
          sender: room.localParticipant.identity,
          text,
        });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      cleanups.splice(0).forEach((cleanup) => cleanup());
      detachTracks();
      await room.disconnect(true);
      deviceErrors.clear();
      pendingDevices.clear();
    },
  };
}
