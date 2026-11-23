import { describe, expect, it, vi } from 'vitest';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { createMediaRoom } from '../../client/src/features/kaiwa/media-room.js';

function setup() {
  /** @type {Map<string, (...args: any[]) => void>} */
  const listeners = new Map();
  const stop = vi.fn();
  const detach = vi.fn();
  const localParticipant = {
    identity: 'user:a',
    trackPublications: new Map([['mic', { track: { stop, detach } }]]),
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
    publishData: vi.fn().mockResolvedValue(undefined),
  };
  const room = {
    state: ConnectionState.Connected,
    localParticipant,
    remoteParticipants: new Map(),
    on: vi.fn((event, listener) => listeners.set(event, listener)),
    off: vi.fn((event) => listeners.delete(event)),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const onMessage = vi.fn();
  const onSessionUpdate = vi.fn();
  const onChange = vi.fn();
  const media = createMediaRoom({
    sessionId: 'session-a',
    memberKeys: ['user:a', 'user:b'],
    room: /** @type {any} */ (room),
    onMessage,
    onSessionUpdate,
    onChange,
  });
  /** @param {unknown} data @param {string|undefined} sender @param {string|undefined} [topic] */
  function receive(data, sender, topic = 'chiikaiwa.chat.v1') {
    listeners.get(RoomEvent.DataReceived)?.(
      new TextEncoder().encode(JSON.stringify(data)),
      sender ? { identity: sender } : undefined,
      undefined,
      topic,
    );
  }
  return {
    media,
    room,
    listeners,
    onMessage,
    onSessionUpdate,
    onChange,
    detach,
    receive,
  };
}

describe('LiveKit media adapter', () => {
  it('connects with server credentials without requesting mic or camera', async () => {
    const { media, room } = setup();
    await media.connect({ url: 'wss://test.invalid', token: 'test-token' });
    expect(room.connect).toHaveBeenCalledWith(
      'wss://test.invalid',
      'test-token',
    );
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
  });
  it('rejects a media identity outside Session members', async () => {
    const { media, room } = setup();
    room.localParticipant.identity = 'user:foreign';
    await expect(
      media.connect({ url: 'wss://test.invalid', token: 'token' }),
    ).rejects.toThrow('Danh tính');
    expect(room.disconnect).toHaveBeenCalledWith(true);
  });
  it('keeps chat usable after denied permission and does not re-request automatically', async () => {
    const { media, room } = setup();
    room.localParticipant.setCameraEnabled.mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );
    await media.setDevice('camera', true);
    expect(media.deviceErrors.get('camera')).toContain('từ chối');
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(1);
    await media.send('<b>こんにちは</b>');
    expect(room.localParticipant.publishData).toHaveBeenCalledOnce();
  });
  it('distinguishes missing devices', async () => {
    const { media, room } = setup();
    room.localParticipant.setMicrophoneEnabled.mockRejectedValue(
      new DOMException('missing', 'NotFoundError'),
    );
    await media.setDevice('microphone', true);
    expect(media.deviceErrors.get('microphone')).toContain('Không tìm thấy');
    expect(media.pendingDevices.size).toBe(0);
  });
  it('validates room, sender, topic, UTF-8 and text before accepting chat', () => {
    const { receive, listeners, onMessage } = setup();
    const message = {
      sessionId: 'session-a',
      id: '1',
      text: '<img src=x onerror=alert(1)>',
    };
    receive(message, 'user:b');
    receive({ ...message, sessionId: 'other' }, 'user:b');
    receive(message, 'user:foreign');
    receive({ ...message, text: {} }, 'user:b');
    receive({ ...message, text: '   ' }, 'user:b');
    receive(message, 'user:b', 'other');
    listeners.get(RoomEvent.DataReceived)?.(
      new Uint8Array([255]),
      { identity: 'user:b' },
      undefined,
      'chiikaiwa.chat.v1',
    );
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({
      id: 'user:b:1',
      sender: 'user:b',
      text: message.text,
    });
  });
  it('treats server data only as a signal to fetch Session, never a state mutation', () => {
    const { listeners, receive, onSessionUpdate, onMessage } = setup();
    const data = {
      type: 'session.updated',
      sessionId: 'session-a',
      version: 3,
    };
    listeners.get(RoomEvent.DataReceived)?.(
      new TextEncoder().encode(JSON.stringify(data)),
      undefined,
      undefined,
      undefined,
    );
    receive(data, 'user:b');
    expect(onSessionUpdate).toHaveBeenCalledExactlyOnceWith(3);
    expect(onMessage).not.toHaveBeenCalled();
  });
  it('sends reliable data only to the other authorized member and acknowledges after publish', async () => {
    const { media, room, onMessage } = setup();
    await media.send('hello');
    const [payload, options] = room.localParticipant.publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(payload))).toMatchObject({
      sessionId: 'session-a',
      text: 'hello',
    });
    expect(options).toEqual({
      reliable: true,
      topic: 'chiikaiwa.chat.v1',
      destinationIdentities: ['user:b'],
    });
    expect(onMessage).toHaveBeenCalledOnce();
    room.localParticipant.publishData.mockRejectedValue(new Error('offline'));
    await expect(media.send('failed')).rejects.toThrow('offline');
    expect(onMessage).toHaveBeenCalledOnce();
  });
  it('rejects empty, oversized and disconnected sends', async () => {
    const { media, room } = setup();
    await expect(media.send(' ')).rejects.toThrow('nhập');
    await expect(media.send('あ'.repeat(6000))).rejects.toThrow('quá dài');
    room.state = ConnectionState.Reconnecting;
    await expect(media.send('hello')).rejects.toThrow('Chưa kết nối');
    expect(room.localParticipant.publishData).not.toHaveBeenCalled();
  });
  it('removes listeners, detaches media and stops tracks on dispose', async () => {
    const { media, listeners, room, detach } = setup();
    await media.dispose();
    expect(listeners.size).toBe(0);
    expect(detach).toHaveBeenCalledOnce();
    expect(room.disconnect).toHaveBeenCalledWith(true);
    await expect(media.send('after leave')).rejects.toThrow();
  });
  it('disconnects a connection that completes after disposal', async () => {
    const { media, room, onChange } = setup();
    let finish = () => {};
    room.connect.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const pending = media.connect({
      url: 'wss://test.invalid',
      token: 'token',
    });
    await media.dispose();
    finish();
    await pending;
    expect(room.disconnect).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
