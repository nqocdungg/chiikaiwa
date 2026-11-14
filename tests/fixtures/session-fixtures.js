import mongoose from 'mongoose';
import { USER_FIXTURES } from './auth-fixtures.js';

export const SESSION_ID = new mongoose.Types.ObjectId(
  '907f1f77bcf86cd799439011',
);
export const SESSION_USERS = [USER_FIXTURES.learnerA, USER_FIXTURES.learnerB];
export const SESSION_ACTORS = SESSION_USERS.map((user) => `user:${user._id}`);

/** @param {Date} at */
export function preparingSession(at) {
  return {
    _id: SESSION_ID,
    originKind: 'invite',
    originId: new mongoose.Types.ObjectId(),
    roomName: `session-${SESSION_ID}`,
    status: 'preparing',
    version: 0,
    members: SESSION_USERS.map((user, index) => ({
      actorKey: SESSION_ACTORS[index],
      kind: 'user',
      userId: user._id,
    })),
    presence: SESSION_ACTORS.map((actorKey) => ({
      actorKey,
      connected: false,
      reconnectUntil: new Date(at.getTime() + 300_000),
    })),
    activeDurationMs: 0,
    selectionRemainingMs: 60_000,
    screenShare: { state: 'idle', version: 0 },
    mediaCleanup: { state: 'none', attempts: 0 },
    createdAt: at,
    updatedAt: at,
  };
}
