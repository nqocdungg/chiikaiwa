import { randomInt, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  decodeContentCursor,
  encodeContentCursor,
  toKnowledgeItemDto,
} from '../content/content-dto.js';
import {
  findContentVersionsByIds,
  queryPublishedTopics,
} from '../content/content-repository.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { finishSessionEffects } from './media-cleanup-service.js';
import { sessionClocks, sessionDeadline } from './session-clock.js';
import { reconcileSessionDeadline } from './session-lifecycle-service.js';
import { projectSession } from './session-projection.js';
import {
  authorizedSession,
  reconcileSession,
  reconcileRoomSession,
  sessionObjectId,
} from './session-service.js';
import {
  sessionEnded,
  sessionExpired,
  sessionVersionConflict,
} from './sessions-errors.js';

/** @typedef {import('mongoose').ClientSession} Transaction */
/** @typedef {import('mongoose').Types.ObjectId} ObjectId */
/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @typedef {NonNullable<Awaited<ReturnType<typeof authorizedSession>>>} Session */
/** @typedef {import('mongoose').mongo.Db} Db */
/** @typedef {'swapRoles'|'skip'|'completeAndNext'} ActionKind */
/** @typedef {{sessionId: string, getIdentity: () => Promise<Identity>, operationId: string, now?: () => Date}} WriteContext */
/** @typedef {{kind:'claim', expectedVersion: number} | {kind:'select', expectedVersion: number, deckVersionId: string} | {kind:'draw', expectedVersion: number, slot: number} | {kind:'propose', expectedVersion: number, actionKind: ActionKind, cardId: string} | {kind:'respond', expectedVersion: number, actionId: string, decision: 'accept'|'reject'}} CardCommand */
/** @typedef {{db: Db, doc: Session, actorKey: string, at: Date, session: Transaction}} Mutation */

const { ObjectId } = mongoose.Types;
const deckFilters = { kind: 'deck', status: 'published' };
const drawnStatuses = ['current', 'completed', 'skipped', 'unfinished'];

/** @param {string} code @param {string} message @param {number} [status] */
function error(code, message, status = 409) {
  return new AppError({ status, code, message });
}

function notFound() {
  return error(
    'RESOURCE_NOT_FOUND',
    'Không tìm thấy học liệu hoặc lá bài trong phạm vi này.',
    404,
  );
}

/** @param {unknown} refs @returns {ObjectId[]} */
function manifestIds(refs) {
  if (!Array.isArray(refs)) return [];
  return [
    ...new Map(
      refs.map((id) => [String(id), new ObjectId(String(id))]),
    ).values(),
  ];
}

/** @param {{sessionId: string, identity: Identity, limit: number, cursor?: string}} input */
export async function readDeckOptions({ sessionId, identity, limit, cursor }) {
  const id = sessionObjectId(sessionId);
  const context = `deck-options:${id}:${identity.actorKey}:`;
  const decoded = cursor?.startsWith(context)
    ? decodeContentCursor(cursor.slice(context.length), deckFilters)
    : null;
  if (cursor !== undefined && !decoded) {
    throw error(
      'INVALID_CURSOR',
      'Con trỏ không khớp danh sách bộ chủ đề.',
      400,
    );
  }
  const db = await connectDatabase();
  const result = await withTransaction(async (session) => {
    const at = new Date();
    const doc = await authorizedSession(id, identity, at, session);
    if (doc.status === 'ended') throw sessionEnded();
    const current = await reconcileSessionDeadline(doc, at, session);
    if (current.status === 'ended') return { endedSession: current };
    const { items, hasMore } = await queryPublishedTopics(
      db,
      { limit, cursor: decoded },
      { session },
    );
    return {
      items: items.map(({ item, version }) => {
        if (version.kind !== 'deck' || !item._id.equals(version.contentId)) {
          throw new Error('Invalid published deck revision');
        }
        const { title, level, description, scenarioVersionIds } =
          version.payload;
        return {
          id: String(item._id),
          versionId: String(version._id),
          title,
          level,
          description,
          scenarioCount: manifestIds(scenarioVersionIds).length,
        };
      }),
      nextCursor: hasMore
        ? context +
          encodeContentCursor(items[items.length - 1].item, deckFilters)
        : null,
    };
  });
  if (result.endedSession) {
    await finishSessionEffects(result.endedSession);
    throw sessionEnded();
  }
  return result;
}

/** @param {{sessionId: string, cardId: string, identity: Identity}} input */
export async function readCardHints({ sessionId, cardId, identity }) {
  const id = sessionObjectId(sessionId);
  const cardObjectId = sessionObjectId(cardId);
  const db = await connectDatabase();
  return withTransaction(async (session) => {
    await authorizedSession(id, identity, new Date(), session);
    const card = await db.collection('session_cards').findOne(
      {
        _id: cardObjectId,
        sessionId: id,
        status: { $in: drawnStatuses },
        drawnAt: { $type: 'date' },
      },
      { session },
    );
    if (!card) throw notFound();
    const scenario = await db
      .collection('content_versions')
      .findOne({ _id: card.scenarioVersionId, kind: 'scenario' }, { session });
    if (!scenario) throw new Error('Missing scenario revision');
    const refs = manifestIds(scenario.payload.knowledgeVersionIds);
    const knowledge = await findContentVersionsByIds(db, refs, { session });
    const byId = new Map(
      knowledge
        .filter((item) => item.kind === 'knowledge')
        .map((item) => [String(item._id), item]),
    );
    const savedItems = await db
      .collection('saved_items')
      .find(
        {
          ownerKey: identity.actorKey,
          isSaved: true,
          knowledgeId: {
            $in: [...byId.values()].map((item) => item.contentId),
          },
        },
        { session, projection: { knowledgeId: 1 } },
      )
      .toArray();
    const saved = new Set(savedItems.map((item) => String(item.knowledgeId)));
    return {
      hints: scenario.payload.hints ?? [],
      knowledge: refs.flatMap((ref) => {
        const version = byId.get(String(ref));
        if (!version) return [];
        const dto = toKnowledgeItemDto(version);
        return [{ ...dto, isSaved: saved.has(dto.id) }];
      }),
    };
  });
}

/** @param {Mutation} input @param {Record<string, unknown>} set @param {{controller?: boolean, unset?: Record<string, ''>}} [options] */
async function updateSession(
  { db, doc, actorKey, at, session },
  set,
  { controller = false, unset } = {},
) {
  const updated = await db.collection('practice_sessions').findOneAndUpdate(
    {
      _id: doc._id,
      version: doc.version,
      status: 'active',
      ...(controller && { controllerKey: actorKey }),
    },
    {
      $set: { ...set, updatedAt: at },
      ...(unset && { $unset: unset }),
      $inc: { version: 1 },
    },
    { session, returnDocument: 'after' },
  );
  if (!updated) throw sessionVersionConflict();
  return updated;
}

/** @param {Mutation} input @param {string} deckVersionId */
async function selectDeck(input, deckVersionId) {
  const { doc, db, at, session } = input;
  if (doc.deckVersionId)
    throw error('DECK_ALREADY_SELECTED', 'Bộ chủ đề đã được chọn.');
  if (
    !(doc.selectionRunningSince instanceof Date) ||
    sessionClocks(doc, at).selectionRemainingMs === 0
  ) {
    throw error('INVALID_SESSION_STATE', 'Phiên chưa sẵn sàng chọn bộ.');
  }
  const versionId = new ObjectId(deckVersionId);
  const deck = await db
    .collection('content_versions')
    .findOne({ _id: versionId, kind: 'deck' }, { session });
  if (
    !deck ||
    !(await db.collection('content_items').findOne(
      {
        _id: deck.contentId,
        kind: 'deck',
        status: 'published',
        publishedVersionId: versionId,
      },
      { session },
    ))
  )
    throw notFound();
  const scenarios = manifestIds(deck.payload?.scenarioVersionIds);
  if (!scenarios.length)
    throw error('DECK_EXHAUSTED', 'Bộ chủ đề không có lá để bốc.');
  for (let i = scenarios.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [scenarios[i], scenarios[j]] = [scenarios[j], scenarios[i]];
  }
  const updated = await updateSession(
    input,
    {
      deckVersionId: versionId,
      selectionRemainingMs: sessionClocks(doc, at).selectionRemainingMs,
    },
    { controller: true, unset: { selectionRunningSince: '' } },
  );
  await db.collection('session_cards').insertMany(
    scenarios.map((scenarioVersionId, slot) => ({
      sessionId: doc._id,
      scenarioVersionId,
      slot,
      status: 'faceDown',
      createdAt: at,
      updatedAt: at,
    })),
    { session },
  );
  return updated;
}

/** @param {Mutation} input @param {number} slot */
async function drawCard(input, slot) {
  const { db, doc, at, session } = input;
  if (!doc.deckVersionId || doc.currentCardId)
    throw error('INVALID_SESSION_STATE', 'Phiên chưa sẵn sàng bốc lá.');
  const cards = db.collection('session_cards');
  const card = await cards.findOne(
    { sessionId: doc._id, slot, status: 'faceDown' },
    { session },
  );
  if (!card) {
    const available = await cards.findOne(
      { sessionId: doc._id, status: 'faceDown' },
      { session },
    );
    if (!available) throw error('DECK_EXHAUSTED', 'Không còn lá chưa bốc.');
    throw error('SLOT_UNAVAILABLE', 'Lá này không thể bốc.');
  }
  const roleA = randomInt(2);
  const updated = await updateSession(
    input,
    { currentCardId: card._id },
    { controller: true },
  );
  const result = await cards.updateOne(
    { _id: card._id, sessionId: doc._id, status: 'faceDown' },
    {
      $set: {
        status: 'current',
        drawnAt: at,
        updatedAt: at,
        roleAKey: doc.members[roleA].actorKey,
        roleBKey: doc.members[1 - roleA].actorKey,
      },
    },
    { session },
  );
  if (!result.matchedCount) throw sessionVersionConflict();
  return updated;
}

/** @param {Mutation} input @param {unknown} cardId */
async function currentCard({ db, doc, session }, cardId) {
  if (!doc.currentCardId || String(doc.currentCardId) !== String(cardId)) {
    throw error('INVALID_SESSION_STATE', 'Lá hiện hành đã thay đổi.');
  }
  const card = await db
    .collection('session_cards')
    .findOne(
      { _id: doc.currentCardId, sessionId: doc._id, status: 'current' },
      { session },
    );
  if (!card)
    throw error('INVALID_SESSION_STATE', 'Không tìm thấy lá hiện hành.');
  return card;
}

/** @param {Mutation} input @param {Extract<CardCommand, {kind:'propose'}>} command */
async function proposeAction(input, command) {
  const { doc, actorKey, at } = input;
  if (doc.pendingAction)
    throw error('ACTION_PENDING', 'Đang chờ phản hồi đề nghị hiện tại.');
  const card = await currentCard(input, command.cardId);
  return updateSession(input, {
    pendingAction: {
      id: randomUUID(),
      kind: command.actionKind,
      cardId: card._id,
      proposedBy: actorKey,
      proposedAt: at,
      baseVersion: doc.version,
    },
  });
}

/** @param {Mutation} input @param {Extract<CardCommand, {kind:'respond'}>} command */
async function respondToAction(input, command) {
  const { db, doc, actorKey, at, session } = input;
  const pending = doc.pendingAction;
  if (!pending || pending.id !== command.actionId)
    throw sessionVersionConflict(undefined, doc.version);
  if (pending.proposedBy === actorKey)
    throw error('FORBIDDEN', 'Chỉ đối tác được phản hồi đề nghị.', 403);
  const card = await currentCard(input, pending.cardId);
  const accept = command.decision === 'accept';
  const swap = pending.kind === 'swapRoles';
  /** @type {Record<string, ''>} */
  const unset = { pendingAction: '' };
  if (accept && !swap) unset.currentCardId = '';
  const updated = await updateSession(input, {}, { unset });
  if (accept) {
    const set = swap
      ? { roleAKey: card.roleBKey, roleBKey: card.roleAKey }
      : {
          status: pending.kind === 'skip' ? 'skipped' : 'completed',
          finishedAt: at,
        };
    const result = await db
      .collection('session_cards')
      .updateOne(
        { _id: card._id, sessionId: doc._id, status: 'current' },
        { $set: { ...set, updatedAt: at } },
        { session },
      );
    if (!result.matchedCount) throw sessionVersionConflict();
  }
  return updated;
}

/** @param {Mutation} input @param {CardCommand} command */
async function applyCommand(input, command) {
  const { doc, actorKey } = input;
  if (doc.status === 'ended') throw sessionEnded();
  if (doc.status === 'reconnecting')
    throw error('SESSION_RECONNECTING', 'Phiên đang kết nối lại.');
  if (
    doc.status !== 'active' ||
    doc.members.length !== 2 ||
    !doc.members.every((/** @type {{actorKey: string}} */ member) =>
      doc.presence?.some(
        (/** @type {{actorKey: string, connected: boolean}} */ entry) =>
          entry.actorKey === member.actorKey && entry.connected,
      ),
    )
  )
    throw error('INVALID_SESSION_STATE', 'Cần đủ hai thành viên đang kết nối.');
  if (doc.version !== command.expectedVersion)
    throw sessionVersionConflict(undefined, doc.version);
  if (
    (command.kind === 'select' || command.kind === 'draw') &&
    doc.controllerKey !== actorKey
  ) {
    throw error(
      'CONTROL_REQUIRED',
      'Chỉ người giữ quyền điều khiển mới có thể thao tác.',
      403,
    );
  }
  switch (command.kind) {
    case 'claim':
      return doc.controllerKey === actorKey
        ? doc
        : updateSession(input, { controllerKey: actorKey });
    case 'select':
      return selectDeck(input, command.deckVersionId);
    case 'draw':
      return drawCard(input, command.slot);
    case 'propose':
      return proposeAction(input, command);
    case 'respond':
      return respondToAction(input, command);
  }
}

/** @param {ObjectId} id @param {CardCommand} command */
function operationPath(id, command) {
  const paths = {
    claim: 'control/claim',
    select: 'deck-selection',
    draw: 'draws',
    propose: 'actions',
  };
  const path =
    command.kind === 'respond'
      ? `actions/${command.actionId}/responses`
      : paths[command.kind];
  return `/api/v1/sessions/${id}/${path}`;
}

/** @param {WriteContext} context @param {CardCommand} command */
export async function changeSessionCards(
  { sessionId, operationId, getIdentity, now = () => new Date() },
  command,
) {
  const id = sessionObjectId(sessionId);
  const identity = await getIdentity();
  await reconcileRoomSession(id, identity, now);
  const db = await connectDatabase();
  /** @type {Session} */ let doc;
  /** @type {Date} */ let at;
  /** @type {Date | undefined} */ let expiredAt;
  /** @type {Session | undefined} */ let changedSession;
  /** @type {{data: Record<string, any>, at: Date}} */ let result;
  try {
    result = /** @type {{data: Record<string, any>, at: Date}} */ (
      await runIdempotentOperation({
        actorKey: identity.actorKey,
        method: 'POST',
        path: operationPath(id, command),
        operationId,
        payload: command,
        authorize: async ({ session }) => {
          expiredAt = undefined;
          changedSession = undefined;
          const current = await getIdentity();
          if (current.actorKey !== identity.actorKey) throw sessionExpired();
          at = now();
          doc = await authorizedSession(id, current, at, session);
        },
        execute: async ({ session }) => {
          const deadline =
            doc.status !== 'ended' ? sessionDeadline(doc) : undefined;
          if (deadline && deadline.at <= at) {
            expiredAt = at;
            throw sessionEnded();
          }
          const updated = await applyCommand(
            { db, doc, actorKey: identity.actorKey, at, session },
            command,
          );
          if (updated.version !== doc.version) changedSession = updated;
          return {
            resultRef: String(id),
            value: {
              data: await projectSession(
                updated,
                identity.actorKey,
                at,
                session,
              ),
              at,
            },
          };
        },
        replay: async ({ session }) => {
          const current = await reconcileSessionDeadline(doc, at, session);
          if (current.version !== doc.version) changedSession = current;
          return {
            data: await projectSession(current, identity.actorKey, at, session),
            at,
          };
        },
      })
    );
  } catch (cause) {
    // Closing an expired room must survive the transaction that rejects the command.
    if (expiredAt) {
      const checkedAt = expiredAt;
      await reconcileSession(id, identity, () => checkedAt);
    }
    throw cause;
  }
  if (changedSession) await finishSessionEffects(changedSession);
  if (identity.kind === 'guest') await authorizedSession(id, identity, now());
  return result;
}
