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
/** @typedef {import('./study-card-service.js').StudyPosition} StudyPosition */

const { ObjectId } = mongoose.Types;

/** @param {ObjectId} id @param {Date | undefined} date @returns {StudyPosition} */
function positionFor(id, date) {
  return { time: (date ?? id.getTimestamp()).getTime(), id: id.toHexString() };
}

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

/** @param {ReturnType<typeof toKnowledgeItemDto>} knowledge @param {StudyPosition} position */
function knowledgeCard(knowledge, position) {
  const { id, versionId, expression, meaning, reading, examples } = knowledge;
  return {
    cardKey: `knowledge:${id}`,
    contentVersionId: versionId,
    position,
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

/** @param {Db} db @param {Identity} identity @param {import('mongoose').mongo.WithId<import('mongoose').mongo.Document>} item */
async function findReadableHiddenVersion(db, identity, item) {
  const versions = db
    .collection('content_versions')
    .find({ contentId: item._id, kind: 'knowledge' })
    .sort({ revision: -1 });
  for await (const version of versions) {
    try {
      await assertKnowledgeSourceAccess(db, {
        identity,
        knowledgeId: item._id,
        knowledgeVersionId: version._id,
        parentItem: item,
        allowAdmin: false,
      });
      return version;
    } catch (error) {
      if (!(error instanceof AppError && error.code === 'FORBIDDEN'))
        throw error;
    }
  }
  return null;
}

/**
 * @param {Db} db
 * @param {Identity} identity
 * @param {ObjectId[]} knowledgeIds
 * @param {ReadonlyMap<string, StudyPosition>} positions
 */
async function readKnowledgeCards(db, identity, knowledgeIds, positions) {
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
    items
      .filter((item) => item.status === 'published')
      .map((item) => item.publishedVersionId),
  );
  const byVersionId = new Map(
    versions.map((version) => [String(version._id), version]),
  );
  /** @type {StudyCard[]} */
  const cards = [];
  for (const item of items) {
    const version =
      item.status === 'hidden'
        ? await findReadableHiddenVersion(db, identity, item)
        : byVersionId.get(String(item.publishedVersionId));
    if (version?.kind !== 'knowledge' || !item._id.equals(version.contentId))
      continue;
    const position =
      positions.get(`knowledge:${item._id}`) ??
      positionFor(item._id, item.createdAt);
    cards.push(knowledgeCard(toKnowledgeItemDto(version), position));
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
    .find(
      { ownerKey, deckId: _id },
      { projection: { cardKey: 1, createdAt: 1 } },
    )
    .toArray();
  const positions = new Map(
    entries
      .filter(
        ({ cardKey }) =>
          typeof cardKey === 'string' && studyCardKeyPattern.test(cardKey),
      )
      .map((entry) => [entry.cardKey, positionFor(entry._id, entry.createdAt)]),
  );
  const keys = [...positions.keys()];
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
    positions,
    knowledgeIds: keys
      .filter((key) => key.startsWith('knowledge:'))
      .map((key) => new ObjectId(key.slice('knowledge:'.length))),
    manualCards: manual.flatMap(({ _id, front, back, version }) => {
      const cardKey = `manual:${_id}`;
      const position = positions.get(cardKey);
      return position
        ? [{ cardKey, front, back, manualVersion: version, position }]
        : [];
    }),
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
  /** @type {Map<string, StudyPosition>} */
  let positions = new Map();
  if (scope.type === 'topic') {
    knowledgeIds = source.map((version) => version.contentId);
  } else if (scope.type === 'saved') {
    const saved = await listSavedItems(ownerKey)
      .select('knowledgeId savedAt')
      .lean();
    const eligible = saved.filter(
      ({ knowledgeId }) => !guest || sourceContentIds.has(String(knowledgeId)),
    );
    knowledgeIds = eligible.map(({ knowledgeId, _id, savedAt }) => {
      positions.set(`knowledge:${knowledgeId}`, positionFor(_id, savedAt));
      return knowledgeId;
    });
  } else {
    ({ knowledgeIds, manualCards, positions } = await readPersonalDeck(
      db,
      ownerKey,
      scope.deckId,
    ));
  }
  const cards = await readKnowledgeCards(db, identity, knowledgeIds, positions);
  return {
    ownerKey,
    scope,
    now,
    cards: [...cards, ...manualCards],
    guestExpiresAt: guest?.expiresAt,
  };
}
