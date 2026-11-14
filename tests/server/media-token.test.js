import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import { readLiveKitEnv } from '../../server/config/env.js';
import { signMediaToken } from '../../server/integrations/livekit/media-token.js';

const config = {
  LIVEKIT_URL: 'wss://media.example.test',
  LIVEKIT_API_KEY: 'test-api-key',
  LIVEKIT_API_SECRET: 'test-only-secret-at-least-32-characters',
};
afterEach(() => vi.unstubAllEnvs());

describe('BE-010 LiveKit signing and configuration', () => {
  it('signs a verifiable room/identity-scoped token with only camera, microphone and data', async () => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    const deadline = new Date(Date.now() + 30_000);
    const credential = await signMediaToken({
      roomName: 'test-room',
      actorKey: 'user:opaque-id',
      expiresAt: deadline,
    });
    const claims = await new TokenVerifier(
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    ).verify(credential.token, 0);
    expect(claims.sub).toBe('user:opaque-id');
    expect(claims.video).toMatchObject({
      room: 'test-room',
      roomJoin: true,
      roomAdmin: false,
      roomCreate: false,
      roomList: false,
      roomRecord: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ['camera', 'microphone'],
      canUpdateOwnMetadata: false,
    });
    expect(claims.exp).toBe(credential.expiresAt.getTime() / 1000);
    expect(credential.expiresAt.getTime()).toBeLessThanOrEqual(
      deadline.getTime(),
    );
    expect(claims.metadata).toBeUndefined();
    expect(credential.url).toBe(config.LIVEKIT_URL);
  });
  it('keeps expiration within the permission deadline when signing crosses a second boundary', async () => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    const now = Date.UTC(2026, 0, 1, 0, 0, 0, 999);
    const deadline = new Date(now + 30_000);
    vi.setSystemTime(now + 1);
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(now);
    try {
      const credential = await signMediaToken({
        roomName: 'test-room',
        actorKey: 'user:opaque-id',
        expiresAt: deadline,
      });
      const claims = await new TokenVerifier(
        config.LIVEKIT_API_KEY,
        config.LIVEKIT_API_SECRET,
      ).verify(credential.token, 0);
      expect(claims.exp).toBe(credential.expiresAt.getTime() / 1000);
      expect(credential.expiresAt.getTime()).toBeLessThanOrEqual(
        deadline.getTime(),
      );
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  });
  it.each([
    'https://media.example.test',
    'ws://media.example.test',
    'wss://user:secret@media.example.test',
    'wss://media.example.test/path',
    'wss://media.example.test/?secret=value',
  ])('rejects unsafe URL %s without echoing credentials', (url) => {
    expect(() => readLiveKitEnv({ ...config, LIVEKIT_URL: url })).toThrow(
      'LIVEKIT_URL',
    );
  });
  it('allows WS only on loopback outside production', () => {
    expect(
      readLiveKitEnv({
        ...config,
        LIVEKIT_URL: 'ws://127.0.0.1:7880',
        NODE_ENV: 'development',
      }).url,
    ).toBe('ws://127.0.0.1:7880');
    expect(() =>
      readLiveKitEnv({
        ...config,
        LIVEKIT_URL: 'ws://127.0.0.1:7880',
        NODE_ENV: 'production',
      }),
    ).toThrow('LIVEKIT_URL');
  });
  it('requires both credentials and rejects expired signing permissions', async () => {
    expect(() => readLiveKitEnv({ ...config, LIVEKIT_API_SECRET: '' })).toThrow(
      'LIVEKIT_API_KEY and LIVEKIT_API_SECRET',
    );
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    await expect(
      signMediaToken({
        roomName: 'room',
        actorKey: 'actor',
        expiresAt: new Date(Date.now() - 1),
      }),
    ).rejects.toThrow('expires too soon');
  });
});
