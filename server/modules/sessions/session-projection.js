import mongoose from 'mongoose';
import { connectDatabase } from '../../persistence/database.js';
import { sessionClocks } from './session-clock.js';

const { ObjectId } = mongoose.Types;

/** @param {any} doc @param {string} actorKey @param {Date} at @param {import('mongoose').ClientSession} [session] */
export async function projectSession(doc, actorKey, at, session) {
  const db = await connectDatabase();
  const members = [];
  for (const member of doc.members) {
    if (member.kind === 'guest') {
      members.push({ actorKey: member.actorKey, displayName: 'Khách' });
      continue;
    }
    const user = await db
      .collection('users')
      .findOne(
        { _id: new ObjectId(member.actorKey.slice(5)) },
        { session, projection: { displayName: 1, avatarKey: 1, profile: 1 } },
      );
    const profile = Object.fromEntries(
      [
        'level',
        'nativeLanguageCode',
        'goal',
        'interests',
        'countryCode',
        'ageGroup',
        'gender',
      ]
        .filter((key) => user?.profile?.[key] !== undefined)
        .map((key) => [key, user?.profile[key]]),
    );
    members.push({
      actorKey: member.actorKey,
      displayName: user?.displayName ?? 'Người học',
      ...(user?.avatarKey ? { avatarKey: user.avatarKey } : {}),
      profile,
    });
  }
  const cards = await db
    .collection('session_cards')
    .find({ sessionId: doc._id }, { session })
    .sort({ slot: 1 })
    .toArray();
  /** @type {Record<string, any>} */
  const result = {
    id: String(doc._id),
    status: doc.status,
    version: doc.version,
    members,
    ...sessionClocks(doc, at),
    slots: cards.map((card) => ({ slot: card.slot, status: card.status })),
    screenShare: {
      state: doc.screenShare.state,
      ...(doc.screenShare.ownerKey
        ? { ownerKey: doc.screenShare.ownerKey }
        : {}),
    },
  };
  for (const key of ['controllerKey', 'endReason', 'suggestedMinutes'])
    if (doc[key] !== undefined) result[key] = doc[key];
  for (const key of ['startedAt', 'endedAt'])
    if (doc[key]) result[key] = doc[key].toISOString();
  if (doc.deckVersionId) result.deckVersionId = String(doc.deckVersionId);
  const deadlines = (doc.presence ?? [])
    .filter(
      (/** @type {any} */ p) =>
        !p.connected && p.reconnectUntil instanceof Date,
    )
    .map((/** @type {any} */ p) => p.reconnectUntil.getTime());
  if (doc.status !== 'ended' && deadlines.length)
    result.reconnectUntil = new Date(Math.min(...deadlines)).toISOString();
  if (doc.pendingAction) {
    const { id, kind, cardId, proposedBy, proposedAt } = doc.pendingAction;
    result.pendingAction = {
      id: String(id),
      kind,
      cardId: String(cardId),
      proposedBy,
      proposedAt: proposedAt.toISOString(),
    };
  }
  const current = cards.find(
    (card) => String(card._id) === String(doc.currentCardId),
  );
  if (
    current &&
    (current.roleAKey === actorKey || current.roleBKey === actorKey)
  ) {
    const revision = await db
      .collection('content_versions')
      .findOne(
        { _id: current.scenarioVersionId, kind: 'scenario' },
        { session },
      );
    if (!revision) throw new Error('Missing scenario revision');
    const payload = revision.payload;
    result.currentCard = {
      id: String(current._id),
      scenarioVersionId: String(current.scenarioVersionId),
      title: payload.title,
      context: payload.context,
      objective: payload.objective,
      myRole: current.roleAKey === actorKey ? payload.roleA : payload.roleB,
      status: current.status,
    };
  }
  return result;
}
