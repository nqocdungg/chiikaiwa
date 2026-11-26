import {
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
  DataPacket_Kind,
  TrackSource,
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
  const participants = await listMediaParticipants(roomName);
  const participant = participants.find((item) => item.identity === actorKey);
  return participant?.state === ParticipantInfo_State.ACTIVE
    ? participant.sid
    : null;
}

/** @param {string} roomName */
export async function listMediaParticipants(roomName) {
  try {
    return await roomClient().listParticipants(roomName);
  } catch (error) {
    if (error instanceof ServerError && error.code === 'not_found') return [];
    throw error;
  }
}

const screenSources = [
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

/** @param {import('livekit-server-sdk').ParticipantInfo} participant */
export function hasScreenMedia(participant) {
  return (
    !participant.permission ||
    (participant.permission.canPublish &&
      (!participant.permission.canPublishSources.length ||
        participant.permission.canPublishSources.some((source) =>
          screenSources.includes(source),
        ))) ||
    participant.tracks.some((track) => screenSources.includes(track.source))
  );
}

/** @param {string} roomName @param {string} actorKey @param {boolean} grant */
export function setScreenPermission(roomName, actorKey, grant) {
  return roomClient().updateParticipant(roomName, actorKey, {
    permission: {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        ...(grant ? screenSources : []),
      ],
    },
  });
}
