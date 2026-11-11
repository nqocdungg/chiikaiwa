import {
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
} from 'livekit-server-sdk';
import { readLiveKitEnv } from '../../config/env.js';

/** @param {string} roomName @param {string} actorKey */
export async function readMediaParticipant(roomName, actorKey) {
  const { url, apiKey, apiSecret } = readLiveKitEnv();
  const host = url.replace(/^ws/u, 'http');
  const client = new RoomServiceClient(host, apiKey, apiSecret, {
    requestTimeout: 5,
  });
  let participants;
  try {
    participants = await client.listParticipants(roomName);
  } catch (error) {
    if (error instanceof ServerError && error.code === 'not_found') return null;
    throw error;
  }
  const participant = participants.find((item) => item.identity === actorKey);
  return participant?.state === ParticipantInfo_State.ACTIVE
    ? participant.sid
    : null;
}
