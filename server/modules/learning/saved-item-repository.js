import { SavedItem, SavedSource } from './saved-item-models.js';

/** @typedef {import('mongoose').Types.ObjectId} ObjectId */
/** @typedef {import('mongoose').ClientSession} ClientSession */
/** @typedef {{knowledgeId: ObjectId, knowledgeVersionId: ObjectId, deckVersionId: ObjectId, sessionId?: ObjectId, scenarioVersionId?: ObjectId, purgeAt?: Date}} KnowledgeSource */

/** @param {string} ownerKey */
function checkOwner(ownerKey) {
  if (
    typeof ownerKey !== 'string' ||
    !/^(user|guest):[0-9a-f]{24}$/.test(ownerKey)
  ) {
    throw new TypeError('A valid ownerKey is required');
  }
}

/** @param {ClientSession} session */
function checkTransaction(session) {
  if (!session?.inTransaction()) {
    throw new Error('Saved item writes require an active transaction');
  }
}

/**
 * Caller validates content access and, for guests, updates the guest guard in this transaction.
 * @param {string} ownerKey
 * @param {KnowledgeSource} source
 * @param {ClientSession} session
 */
export async function saveKnowledge(ownerKey, source, session) {
  checkOwner(ownerKey);
  checkTransaction(session);
  const now = new Date();
  const item = await SavedItem.findOne({
    ownerKey,
    knowledgeId: source.knowledgeId,
  }).session(session);
  const savedItem =
    item ??
    new SavedItem({
      ownerKey,
      knowledgeId: source.knowledgeId,
      savedAt: now,
      purgeAt: source.purgeAt,
    });
  if (item && !item.isSaved) {
    savedItem.isSaved = true;
    savedItem.savedAt = now;
  }
  if (item) savedItem.version += 1;
  if (source.purgeAt) savedItem.purgeAt = source.purgeAt;
  const candidate = new SavedSource({
    savedItemId: savedItem._id,
    ownerKey,
    knowledgeId: source.knowledgeId,
    knowledgeVersionId: source.knowledgeVersionId,
    deckVersionId: source.deckVersionId,
    sessionId: source.sessionId,
    scenarioVersionId: source.scenarioVersionId,
    purgeAt: source.purgeAt,
    createdAt: now,
  });
  await candidate.validate();
  await savedItem.save({ session });
  const existing = await SavedSource.exists({
    ownerKey,
    knowledgeId: source.knowledgeId,
    contextKey: candidate.contextKey,
  }).session(session);
  if (!existing) await candidate.save({ session, validateBeforeSave: false });
  return savedItem;
}

/** @param {string} ownerKey @param {ObjectId} id */
export function findSavedItem(ownerKey, id) {
  checkOwner(ownerKey);
  return SavedItem.findOne({ ownerKey, _id: id });
}

/** @param {string} ownerKey */
export function listSavedItems(ownerKey) {
  checkOwner(ownerKey);
  return SavedItem.find({ ownerKey, isSaved: true }).sort({
    savedAt: -1,
    _id: -1,
  });
}

/** @param {string} ownerKey @param {ObjectId} savedItemId */
export async function listSavedSources(ownerKey, savedItemId) {
  checkOwner(ownerKey);
  const item = await SavedItem.findOne({ ownerKey, _id: savedItemId })
    .select('knowledgeId')
    .lean();
  if (!item) return [];
  return SavedSource.find({
    ownerKey,
    knowledgeId: item.knowledgeId,
    savedItemId,
  }).sort({
    createdAt: -1,
    _id: -1,
  });
}

/**
 * @param {string} ownerKey
 * @param {ObjectId} id
 * @param {number} expectedVersion
 * @param {ClientSession} session
 */
export function unsaveKnowledge(ownerKey, id, expectedVersion, session) {
  checkOwner(ownerKey);
  checkTransaction(session);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new TypeError('A non-negative expectedVersion is required');
  }
  return SavedItem.findOneAndUpdate(
    { ownerKey, _id: id, version: expectedVersion, isSaved: true },
    { $set: { isSaved: false }, $inc: { version: 1 } },
    { session, returnDocument: 'after', runValidators: true },
  );
}
