import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';
import { toKnowledgeItemDto } from '../content/content-dto.js';
import {
  findContentItemById,
  findContentVersionById,
} from '../content/content-repository.js';
import {
  assertDeckVersionSourceAccess,
  assertKnowledgeSourceAccess,
} from '../content/content-service.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import {
  findSavedItem,
  listSavedItems,
  saveKnowledge,
  unsaveKnowledge,
} from './saved-item-repository.js';
import { SavedSource } from './saved-item-models.js';

/** @typedef {import('mongoose').mongo.Db} Db */
/** @typedef {import('mongoose').ClientSession} Transaction */
/** @typedef {import('mongoose').Types.ObjectId} ObjectId */
/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @typedef {NonNullable<Awaited<ReturnType<typeof findSavedItem>>>} SavedItem */
/** @typedef {{knowledgeVersionId: string, deckVersionId: string, sessionId?: string, scenarioVersionId?: string}} SaveInput */
/** @typedef {{size: number, cursor?: string}} PageInput */
/** @typedef {{identity: Identity, getIdentity: () => Promise<Identity>, operationId: string}} WriteInput */

import { guestAccess } from './guest-write-guard.js';

const { ObjectId } = mongoose.Types;

function notFound() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'Không tìm thấy mục đã lưu hoặc nguồn học liệu.',
  });
}

/** @param {unknown} refs @param {ObjectId} id */
function includesId(refs, id) {
  return Array.isArray(refs) && refs.some((ref) => id.equals(ref));
}

/** @param {Db} db @param {Identity} identity @param {SaveInput} input @param {Transaction} session @param {Awaited<ReturnType<typeof guestAccess>>} guest */
async function resolveSaveSource(db, identity, input, session, guest) {
  const deckVersionId = new ObjectId(input.deckVersionId);
  const knowledgeVersionId = new ObjectId(input.knowledgeVersionId);
  const sessionId = input.sessionId && new ObjectId(input.sessionId);
  const scenarioVersionId =
    input.scenarioVersionId && new ObjectId(input.scenarioVersionId);
  if (
    guest &&
    (!guest.deckVersionId.equals(deckVersionId) ||
      (sessionId && !guest.sessionId.equals(sessionId)))
  )
    throw notFound();
  const deck = await findContentVersionById(db, deckVersionId, { session });
  const knowledge = await findContentVersionById(db, knowledgeVersionId, {
    session,
  });
  if (
    deck?.kind !== 'deck' ||
    knowledge?.kind !== 'knowledge' ||
    !includesId(deck.payload?.knowledgeVersionIds, knowledgeVersionId)
  )
    throw notFound();

  const deckItem = await findContentItemById(db, deck.contentId, { session });
  const knowledgeItem = await findContentItemById(db, knowledge.contentId, {
    session,
  });
  if (
    deckItem?.kind !== 'deck' ||
    knowledgeItem?.kind !== 'knowledge' ||
    !['published', 'hidden'].includes(deckItem.status) ||
    !['published', 'hidden'].includes(knowledgeItem.status)
  )
    throw notFound();

  if (sessionId && scenarioVersionId) {
    if (!includesId(deck.payload?.scenarioVersionIds, scenarioVersionId))
      throw notFound();
    const trial = await db.collection('practice_sessions').findOne(
      {
        _id: sessionId,
        deckVersionId,
        'members.actorKey': identity.actorKey,
      },
      { session },
    );
    const card =
      trial &&
      (await db.collection('session_cards').findOne(
        {
          sessionId,
          scenarioVersionId,
          drawnAt: { $type: 'date' },
          status: { $in: ['current', 'completed', 'skipped', 'unfinished'] },
        },
        { session },
      ));
    if (!card) throw notFound();
    const scenario = await findContentVersionById(db, scenarioVersionId, {
      session,
    });
    if (
      scenario?.kind !== 'scenario' ||
      !includesId(scenario.payload?.knowledgeVersionIds, knowledgeVersionId)
    )
      throw notFound();
  } else {
    await requireSource(() =>
      assertDeckVersionSourceAccess(db, {
        identity,
        deckVersionId,
        parentItem: deckItem,
        session,
        allowAdmin: false,
      }),
    );
    if (knowledgeItem.status === 'hidden') {
      await requireSource(() =>
        assertKnowledgeSourceAccess(db, {
          identity,
          knowledgeId: knowledge.contentId,
          knowledgeVersionId,
          parentItem: knowledgeItem,
          session,
          allowAdmin: false,
        }),
      );
    }
  }
  return {
    knowledgeId: /** @type {ObjectId} */ (knowledge.contentId),
    knowledgeVersionId,
    deckVersionId,
    ...(sessionId && scenarioVersionId && { sessionId, scenarioVersionId }),
    purgeAt: guest?.purgeAt,
  };
}

/** @template T @param {() => Promise<T>} work */
async function requireSource(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN')
      throw notFound();
    throw error;
  }
}

/** @param {Db} db @param {SavedItem} item @param {Awaited<ReturnType<typeof guestAccess>>} guest @param {Transaction} [session] */
async function toSavedItemDto(db, item, guest, session) {
  const parent = await findContentItemById(db, item.knowledgeId, { session });
  if (
    parent?.kind !== 'knowledge' ||
    !['published', 'hidden'].includes(parent.status)
  )
    return null;
  const filter = { kind: 'knowledge', contentId: item.knowledgeId };
  let version;
  if (guest || parent.status === 'hidden') {
    const sources = await SavedSource.find({
      ownerKey: item.ownerKey,
      savedItemId: item._id,
      ...(guest && { deckVersionId: guest.deckVersionId }),
    })
      .select('knowledgeVersionId')
      .session(session ?? null)
      .lean();
    version = await db.collection('content_versions').findOne(
      {
        ...filter,
        _id: { $in: sources.map((source) => source.knowledgeVersionId) },
      },
      { session, sort: { revision: -1 } },
    );
  } else if (parent.publishedVersionId) {
    version = await db
      .collection('content_versions')
      .findOne({ ...filter, _id: parent.publishedVersionId }, { session });
  }
  if (!version) return null;
  return {
    id: String(item._id),
    knowledge: toKnowledgeItemDto(version),
    savedAt: item.savedAt.toISOString(),
    version: item.version,
  };
}

/** @param {PageInput} page @param {string} context @param {'savedAt'|'createdAt'} field */
function pageFilter({ cursor }, context, field) {
  if (cursor === undefined) return {};
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    const decoded = JSON.parse(bytes.toString('utf8'));
    if (
      bytes.toString('base64url') === cursor &&
      decoded?.context === context &&
      typeof decoded.date === 'string' &&
      typeof decoded.id === 'string' &&
      /^[a-f0-9]{24}$/u.test(decoded.id)
    ) {
      const date = new Date(decoded.date);
      if (date.toISOString() === decoded.date) {
        return {
          $or: [
            { [field]: { $lt: date } },
            { [field]: date, _id: { $lt: new ObjectId(decoded.id) } },
          ],
        };
      }
    }
  } catch {
    // Invalid cursors have one public error.
  }
  throw new AppError({
    status: 400,
    code: 'INVALID_CURSOR',
    message: 'Con trỏ không hợp lệ hoặc không khớp danh sách.',
  });
}

/** @param {string} context @param {{_id: ObjectId}} row @param {Date} date */
function nextCursor(context, row, date) {
  return Buffer.from(
    JSON.stringify({ context, date: date.toISOString(), id: String(row._id) }),
  ).toString('base64url');
}

/** @param {Identity} identity @param {PageInput & {sessionId?: string}} page */
export async function readSavedItems(identity, page) {
  const db = await connectDatabase();
  const guest = await guestAccess(db, identity);
  const ownerKey = identity.actorKey;
  if (page.sessionId) {
    const id = new ObjectId(page.sessionId);
    if (
      (guest && !guest.sessionId.equals(id)) ||
      !(await db
        .collection('practice_sessions')
        .findOne({ _id: id, 'members.actorKey': ownerKey }))
    )
      throw notFound();
  }
  const context = JSON.stringify([ownerKey, 'items', page.sessionId ?? null]);
  const filter = pageFilter(page, context, 'savedAt');
  const sourceFilter = {
    ownerKey,
    ...(page.sessionId && { sessionId: new ObjectId(page.sessionId) }),
    ...(guest && { deckVersionId: guest.deckVersionId }),
  };
  const ids =
    page.sessionId || guest
      ? await SavedSource.distinct('savedItemId', sourceFilter)
      : null;
  const rows = listSavedItems(ownerKey)
    .find({ ...filter, ...(ids && { _id: { $in: ids } }) })
    .cursor();
  const items = [];
  let cursor = null;
  for await (const row of rows) {
    const dto = await toSavedItemDto(db, row, guest);
    if (!dto) continue;
    if (items.length === page.size) {
      return { items, nextCursor: cursor };
    }
    items.push(dto);
    cursor = nextCursor(context, row, row.savedAt);
  }
  return { items, nextCursor: null };
}

/** @param {Identity} identity @param {string} id @param {PageInput} page */
export async function readSavedSources(identity, id, page) {
  const db = await connectDatabase();
  const guest = await guestAccess(db, identity);
  const ownerKey = identity.actorKey;
  const savedItemId = new ObjectId(id);
  const context = JSON.stringify([ownerKey, 'sources', id]);
  const filter = pageFilter(page, context, 'createdAt');
  const item = await findSavedItem(ownerKey, savedItemId);
  if (!item) throw notFound();
  const sourceFilter = {
    ownerKey,
    savedItemId,
    knowledgeId: item.knowledgeId,
    ...(guest && { deckVersionId: guest.deckVersionId }),
  };
  const pageRows = await SavedSource.find({ ...sourceFilter, ...filter })
    .sort({ createdAt: -1, _id: -1 })
    .limit(page.size + 1)
    .lean();
  if (guest && !pageRows.length && !(await SavedSource.exists(sourceFilter)))
    throw notFound();
  const hasMore = pageRows.length > page.size;
  const selected = pageRows.slice(0, page.size);
  const last = selected.at(-1);
  return {
    items: selected.map((row) => ({
      knowledgeVersionId: String(row.knowledgeVersionId),
      deckVersionId: String(row.deckVersionId),
      ...(row.sessionId && {
        sessionId: String(row.sessionId),
        scenarioVersionId: String(row.scenarioVersionId),
      }),
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor:
      hasMore && last ? nextCursor(context, last, last.createdAt) : null,
  };
}

/** @param {WriteInput} write */
async function recheckIdentity({ identity, getIdentity }) {
  const current = await getIdentity();
  if (current.actorKey !== identity.actorKey) {
    throw new AppError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message: 'Danh tính đã thay đổi.',
    });
  }
  return current;
}

/** @param {WriteInput} write @param {SaveInput} input */
export async function upsertSavedItem(write, input) {
  const db = await connectDatabase();
  const ownerKey = write.identity.actorKey;
  /** @type {Identity} */ let current;
  /** @type {Awaited<ReturnType<typeof guestAccess>>} */ let guest;
  return runIdempotentOperation({
    actorKey: ownerKey,
    method: 'POST',
    path: '/api/v1/me/saved-items',
    operationId: write.operationId,
    payload: input,
    authorize: async ({ session, replay }) => {
      current = await recheckIdentity(write);
      guest = await guestAccess(db, current, session, !replay);
    },
    execute: async ({ session }) => {
      const source = await resolveSaveSource(
        db,
        current,
        input,
        session,
        guest,
      );
      const item = await saveKnowledge(ownerKey, source, session);
      const value = await toSavedItemDto(db, item, guest, session);
      if (!value) throw notFound();
      return { resultRef: String(item._id), value };
    },
    replay: async ({ receipt, session }) => {
      await resolveSaveSource(db, current, input, session, guest);
      if (!receipt.resultRef) throw notFound();
      const item = await findSavedItem(
        ownerKey,
        new ObjectId(receipt.resultRef),
      ).session(session);
      const value = item?.isSaved
        ? await toSavedItemDto(db, item, guest, session)
        : null;
      if (!value) throw notFound();
      return value;
    },
  });
}

/** @param {WriteInput} write @param {string} id @param {number} expectedVersion */
export async function removeSavedItem(write, id, expectedVersion) {
  const db = await connectDatabase();
  const ownerKey = write.identity.actorKey;
  const itemId = new ObjectId(id);
  await runIdempotentOperation({
    actorKey: ownerKey,
    method: 'DELETE',
    path: `/api/v1/me/saved-items/${id}`,
    operationId: write.operationId,
    payload: { expectedVersion },
    authorize: async ({ session, replay }) => {
      const current = await recheckIdentity(write);
      const guest = await guestAccess(db, current, session, !replay);
      if (!(await findSavedItem(ownerKey, itemId).session(session)))
        throw notFound();
      if (
        guest &&
        !(await SavedSource.exists({
          ownerKey,
          savedItemId: itemId,
          deckVersionId: guest.deckVersionId,
        }).session(session))
      )
        throw notFound();
    },
    execute: async ({ session }) => {
      const item = await unsaveKnowledge(
        ownerKey,
        itemId,
        expectedVersion,
        session,
      );
      if (!item) {
        const current = await findSavedItem(ownerKey, itemId).session(session);
        if (!current) throw notFound();
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: 'Mục đã thay đổi. Vui lòng tải lại.',
          details: { currentVersion: current.version },
        });
      }
      return { resultRef: id, value: null };
    },
    replay: async () => null,
  });
}
