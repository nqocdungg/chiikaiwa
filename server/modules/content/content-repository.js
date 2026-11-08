import mongoose from 'mongoose';

const { ObjectId } = mongoose.Types;

/**
 * @param {import('mongoose').mongo.Db} db
 */
export function contentItemsCollection(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('content_items')
  );
}

/**
 * @param {import('mongoose').mongo.Db} db
 */
export function contentVersionsCollection(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('content_versions')
  );
}

/**
 * Lưu một content item mới vào database.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {Record<string, any>} doc
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function insertContentItem(db, doc, { session } = {}) {
  const collection = contentItemsCollection(db);
  await collection.insertOne(doc, { session });
  return doc;
}

/**
 * Lấy content item theo ID.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {string | import('mongoose').Types.ObjectId} id
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function findContentItemById(db, id, { session } = {}) {
  const objectId = id instanceof ObjectId ? id : new ObjectId(id);
  const collection = contentItemsCollection(db);
  return collection.findOne({ _id: objectId }, { session });
}

/**
 * Cập nhật payload nháp có kiểm tra CAS expectedVersion.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} params
 * @param {string | import('mongoose').Types.ObjectId} params.id
 * @param {number} params.expectedVersion
 * @param {Record<string, any>} params.draftPayload
 * @param {string} [params.level]
 * @param {string} [params.title]
 * @param {import('mongoose').Types.ObjectId} params.updatedBy
 * @param {Date} params.now
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 * @returns {Promise<{ status: 'ok', doc: any } | { status: 'not_found' } | { status: 'conflict', currentVersion: number }>}
 */
export async function updateDraftContentItemCas(
  db,
  { id, expectedVersion, draftPayload, level, title, updatedBy, now },
  { session } = {},
) {
  const objectId = id instanceof ObjectId ? id : new ObjectId(id);
  const collection = contentItemsCollection(db);

  /** @type {Record<string, any>} */
  const setFields = {
    draftPayload,
    updatedBy,
    updatedAt: now,
  };

  if (level !== undefined) {
    setFields.level = level;
  }
  if (title !== undefined) {
    setFields.title = title;
  }

  const result = await collection.updateOne(
    { _id: objectId, version: expectedVersion },
    {
      $set: setFields,
      $inc: { version: 1 },
    },
    { session },
  );

  if (result.matchedCount === 1) {
    const updated = await collection.findOne({ _id: objectId }, { session });
    return { status: 'ok', doc: updated };
  }

  // Trường hợp không match được: kiểm tra do không tồn tại hay do lệch version
  const existing = await collection.findOne(
    { _id: objectId },
    { session, projection: { version: 1 } },
  );

  if (!existing) {
    return { status: 'not_found' };
  }

  return { status: 'conflict', currentVersion: existing.version };
}

/**
 * Lấy danh sách content items theo bộ lọc và keyset cursor.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} params
 * @param {string} [params.kind]
 * @param {string} [params.status]
 * @param {string} [params.level]
 * @param {number} params.limit
 * @param {{ createdAt: Date, id: import('mongoose').Types.ObjectId } | null} [params.cursor]
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function queryContentItems(
  db,
  { kind, status, level, limit, cursor },
  { session } = {},
) {
  const collection = contentItemsCollection(db);

  /** @type {Record<string, any>} */
  const filter = {};

  if (kind) {
    filter.kind = kind;
  }
  if (status) {
    filter.status = status;
  }
  if (level) {
    filter.level = level;
  }

  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ];
  }

  // Lấy thêm 1 bản ghi để kiểm tra xem còn trang tiếp theo hay không
  const rawItems = await collection
    .find(filter, { session })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = rawItems.length > limit;
  const items = hasMore ? rawItems.slice(0, limit) : rawItems;

  return {
    items,
    hasMore,
  };
}
