import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { readLiveKitEnv } from '../../config/env.js';

/** @param {{roomName: string, actorKey: string, expiresAt: Date}} input */
export async function signMediaToken({ roomName, actorKey, expiresAt }) {
  const config = readLiveKitEnv();
  const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  if (ttl < 1) throw new Error('Media permission expires too soon');
  // SDK ký vé tại server bằng secret; bước này không gọi mạng LiveKit.
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: actorKey,
    ttl,
  });
  // Chỉ cho camera/mic và chat, không cấp quản trị hoặc chia sẻ màn hình.
  token.addGrant({
    room: roomName,
    roomJoin: true,
    roomAdmin: false,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    canUpdateOwnMetadata: false,
  });
  const jwt = await token.toJwt();
  // Đọc hạn từ vé vừa ký vì JWT tính theo giây; không đọc token do client gửi.
  const claims = JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
  );
  const actualExpiry = new Date(claims.exp * 1000);
  if (!Number.isFinite(actualExpiry.getTime()) || actualExpiry > expiresAt) {
    throw new Error('Media expiration exceeds permission');
  }
  return { url: config.url, token: jwt, expiresAt: actualExpiry };
}
