import mongoose from 'mongoose';
import { toKnowledgeItemDto } from '../content/content-dto.js';
import {
  findContentVersionById,
  findContentVersionsByIds,
} from '../content/content-repository.js';
import {
  assertDeckVersionSourceAccess,
  assertKnowledgeSourceAccess,
} from '../content/content-service.js';
import { AppError } from '../../middleware/http-error.js';
import { listSavedItems } from './saved-item-repository.js';
import { studyCardKeyPattern } from './study-card-service.js';

/** @typedef {import('mongoose').mongo.Db} Db */
/** @typedef {import('mongoose').Types.ObjectId} ObjectId */
/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @typedef {import('./study-card-service.js').StudyScope} StudyScope */
/** @typedef {import('./study-card-service.js').StudyCard} StudyCard */

const { ObjectId } = mongoose.Types;
function studyNotFound() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'Không tìm thấy phạm vi học.',
  });
}

/** @param {Db} db @param {Extract<Identity, {kind: 'guest'}>} identity @param {Date} now */
async function readGuestTrial(db, identity, now) {
  const guest = await db
    .collection('guest_sessions')
    .findOne({ _id: identity.guestId });
  if (
    !guest ||
    guest.revokedAt ||
    guest.status === 'expired' ||
    (guest.expiresAt && guest.expiresAt <= now)
  ) {
    throw new AppError({
      status: 410,
      code: 'GUEST_EXPIRED',
      message: 'Quyền truy cập tạm của khách đã hết hạn.',
    });
  }
  if (
    !guest.practiceSessionId ||
    !['active', 'summary'].includes(guest.status)
  ) {
    throw studyNotFound();
  }
  const session = await db.collection('practice_sessions').findOne({
    _id: guest.practiceSessionId,
    'members.actorKey': identity.actorKey,
  });
  if (!session?.deckVersionId) throw studyNotFound();
  const deadline =
    session.endedAt instanceof Date
      ? new Date(session.endedAt.getTime() + 15 * 60 * 1000)
      : undefined;
  const expiresAt =
    guest.expiresAt instanceof Date && (!deadline || guest.expiresAt < deadline)
      ? guest.expiresAt
      : deadline;
  if (expiresAt && expiresAt <= now) {
    throw new AppError({
      status: 410,
      code: 'GUEST_EXPIRED',
      message: 'Quyền truy cập tạm của khách đã hết hạn.',
    });
  }
  return { deckVersionId: String(session.deckVersionId), expiresAt };
}

/** @param {Db} db @param {string} versionId @param {Identity} identity */
async function readTopicKnowledge(db, versionId, identity) {
  const deck = await findContentVersionById(db, versionId);
  if (deck?.kind !== 'deck') throw studyNotFound();
  const parent = await db.collection('content_items').findOne({
    _id: deck.contentId,
    kind: 'deck',
    status: { $in: ['published', 'hidden'] },
  });
  if (!parent) throw studyNotFound();
  try {
    await assertDeckVersionSourceAccess(db, {
      identity,
      deckVersionId: deck._id,
      parentItem: parent,
      allowAdmin: false,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN')
      throw studyNotFound();
    throw error;
  }
  const refs = deck.payload?.knowledgeVersionIds ?? [];
  return (await findContentVersionsByIds(db, refs)).filter(
    (version) => version.kind === 'knowledge',
  );
}

/** @param {ReturnType<typeof toKnowledgeItemDto>} knowledge */
function knowledgeCard(knowledge) {
  const { id, versionId, expression, meaning, reading, examples } = knowledge;
  return {
    cardKey: `knowledge:${id}`,
    contentVersionId: versionId,
    front: expression,
    back: [
      meaning,
      reading && `Cách đọc: ${reading}`,
      ...examples.map(
        ({ japanese, vietnamese }) => `${japanese}\n${vietnamese}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/**
 * @param {Db} db
 * @param {Identity} identity
 * @param {ObjectId[]} knowledgeIds
 */
async function readKnowledgeCards(db, identity, knowledgeIds) {
  if (!knowledgeIds.length) return [];
  const items = await db
    .collection('content_items')
    .find({
      _id: { $in: knowledgeIds },
      kind: 'knowledge',
      status: { $in: ['published', 'hidden'] },
      publishedVersionId: { $type: 'objectId' },
    })
    .toArray();
  const versions = await findContentVersionsByIds(
    db,
    items.map((item) => item.publishedVersionId),
  );
  const byVersionId = new Map(
    versions.map((version) => [String(version._id), version]),
  );
  /** @type {StudyCard[]} */
  const cards = [];
  for (const item of items) {
    const versionId = String(item.publishedVersionId);
    const version = byVersionId.get(versionId);
    if (version?.kind !== 'knowledge' || !item._id.equals(version.contentId))
      continue;
    if (item.status === 'hidden') {
      try {
        await assertKnowledgeSourceAccess(db, {
          identity,
          knowledgeId: item._id,
          knowledgeVersionId: version._id,
          parentItem: item,
          allowAdmin: false,
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'FORBIDDEN') continue;
        throw error;
      }
    }
    cards.push(knowledgeCard(toKnowledgeItemDto(version)));
  }
  return cards;
}

/** @param {Db} db @param {string} ownerKey @param {string} deckId */
async function readPersonalDeck(db, ownerKey, deckId) {
  const _id = new ObjectId(deckId);
  const deck = await db.collection('personal_decks').findOne({ _id, ownerKey });
  if (deck?.status === 'deleting') {
    throw new AppError({
      status: 410,
      code: 'RESOURCE_DELETING',
      message: 'Bộ thẻ đang được xóa.',
    });
  }
  if (deck?.status !== 'active') throw studyNotFound();
  const entries = await db
    .collection('deck_entries')
    .find({ ownerKey, deckId: _id }, { projection: { cardKey: 1 } })
    .toArray();
  const keys = entries
    .map(({ cardKey }) => cardKey)
    .filter((key) => typeof key === 'string' && studyCardKeyPattern.test(key));
  const manualIds = keys
    .filter((key) => key.startsWith('manual:'))
    .map((key) => new ObjectId(key.slice('manual:'.length)));
  const manual = manualIds.length
    ? await db
        .collection('manual_cards')
        .find({
          _id: { $in: manualIds },
          ownerKey,
          status: 'active',
        })
        .toArray()
    : [];
  return {
    knowledgeIds: keys
      .filter((key) => key.startsWith('knowledge:'))
      .map((key) => new ObjectId(key.slice('knowledge:'.length))),
    manualCards: manual.map(({ _id, front, back, version }) => ({
      cardKey: `manual:${_id}`,
      front,
      back,
      manualVersion: version,
    })),
  };
}

/** @param {Db} db @param {Identity} identity @param {StudyScope} scope @param {Date} now */
export async function resolveStudySet(db, identity, scope, now) {
  const ownerKey = identity.actorKey;
  const guest =
    identity.kind === 'guest' ? await readGuestTrial(db, identity, now) : null;
  if (
    guest &&
    (scope.type === 'personalDeck' ||
      (scope.type === 'topic' && scope.topicVersionId !== guest.deckVersionId))
  ) {
    throw studyNotFound();
  }
  const topicVersionId =
    scope.type === 'topic' ? scope.topicVersionId : guest?.deckVersionId;
  const source = topicVersionId
    ? await readTopicKnowledge(db, topicVersionId, identity)
    : [];
  const sourceContentIds = new Set(
    source.map((version) => String(version.contentId)),
  );
  /** @type {ObjectId[]} */
  let knowledgeIds;
  /** @type {StudyCard[]} */
  let manualCards = [];
  if (scope.type === 'topic') {
    knowledgeIds = source.map((version) => version.contentId);
  } else if (scope.type === 'saved') {
    const saved = await listSavedItems(ownerKey).select('knowledgeId').lean();
    knowledgeIds = saved
      .map(({ knowledgeId }) => knowledgeId)
      .filter((id) => !guest || sourceContentIds.has(String(id)));
  } else {
    ({ knowledgeIds, manualCards } = await readPersonalDeck(
      db,
      ownerKey,
      scope.deckId,
    ));
  }
  const cards = await readKnowledgeCards(db, identity, knowledgeIds);
  return {
    ownerKey,
    scope,
    now,
    cards: [...cards, ...manualCards],
    guestExpiresAt: guest?.expiresAt,
  };
}
