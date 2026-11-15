import {
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
  DataPacket_Kind,
} from 'livekit-server-sdk';
import { readLiveKitEnv } from '../../config/env.js';

function roomClient() {
  const { url, apiKey, apiSecret } = readLiveKitEnv();
  return new RoomServiceClient(url.replace(/^ws/u, 'http'), apiKey, apiSecret, {
    requestTimeout: 5,
  });
}

/** @param {string} roomName @param {string} actorKey */
export async function removeMediaParticipant(roomName, actorKey) {
  // Cloud revokes the identity even after it has left. Use the current cutoff,
  // never an old endedAt that can fall outside Cloud's accepted clock window.
  await roomClient().removeParticipant(roomName, actorKey, {
    revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000) + 1),
  });
}

/** @param {string} roomName */
export async function closeMediaRoom(roomName) {
  try {
    await roomClient().deleteRoom(roomName);
  } catch (error) {
    if (!(error instanceof ServerError && error.code === 'not_found'))
      throw error;
  }
}

/** @param {string} roomName @param {string} sessionId @param {number} version */
export async function notifyMediaSession(roomName, sessionId, version) {
  await roomClient().sendData(
    roomName,
    Buffer.from(
      JSON.stringify({ type: 'session.updated', sessionId, version }),
    ),
    DataPacket_Kind.RELIABLE,
    {},
  );
}

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
