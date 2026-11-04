import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SavedItem,
  SavedSource,
} from '../../server/modules/learning/saved-item-models.js';
import {
  findSavedItem,
  listSavedItems,
  listSavedSources,
  saveKnowledge,
  unsaveKnowledge,
} from '../../server/modules/learning/saved-item-repository.js';
import { up } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

const { ObjectId } = mongoose.Types;
const owner = `user:${new ObjectId()}`;
const otherOwner = `user:${new ObjectId()}`;
const source = {
  knowledgeId: new ObjectId(),
  knowledgeVersionId: new ObjectId(),
  deckVersionId: new ObjectId(),
};
/** @type {MongoMemoryReplSet} */
let replicaSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replicaSet.getUri(), {
    dbName: 'chiikaiwa_saved_items_test',
    autoIndex: false,
    autoCreate: false,
  });
  const db = mongoose.connection.db;
  if (!db) throw new Error('Test database is not ready');
  await up(db);
});

beforeEach(async () => {
  await SavedSource.deleteMany({});
  await SavedItem.deleteMany({});
  await mongoose.connection.collection('card_progress').deleteMany({});
  await mongoose.connection.collection('review_logs').deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

/** @param {import('../../server/modules/learning/saved-item-repository.js').KnowledgeSource} [input] @param {string} [ownerKey] */
function save(input = source, ownerKey = owner) {
  return mongoose.connection.transaction((session) =>
    saveKnowledge(ownerKey, input, session),
  );
}

describe('saved items and sources', () => {
  it('deduplicates concurrent first saves', async () => {
    const results = await Promise.all([save(), save()]);
    expect(results[0]._id.equals(results[1]._id)).toBe(true);
    expect(await SavedItem.countDocuments()).toBe(1);
    expect(await SavedSource.countDocuments()).toBe(1);
  });

  it('keeps two drawn scenarios from the same session as separate sources', async () => {
    const sessionId = new ObjectId();
    const first = { ...source, sessionId, scenarioVersionId: new ObjectId() };
    const second = { ...source, sessionId, scenarioVersionId: new ObjectId() };
    const item = await save(first);
    await save(second);
    await save(first);
    const sources = await listSavedSources(owner, item._id);
    expect(sources).toHaveLength(2);
    expect(
      sources.map((entry) => entry.scenarioVersionId?.toHexString()),
    ).toEqual(
      expect.arrayContaining([
        first.scenarioVersionId.toHexString(),
        second.scenarioVersionId.toHexString(),
      ]),
    );
    expect(await SavedItem.countDocuments()).toBe(1);
  });
  it('serializes concurrent sources for an existing knowledge item', async () => {
    const item = await save();
    await Promise.all([
      save({ ...source, deckVersionId: new ObjectId() }),
      save({ ...source, deckVersionId: new ObjectId() }),
    ]);
    expect(await SavedItem.countDocuments()).toBe(1);
    expect(await listSavedSources(owner, item._id)).toHaveLength(3);
    expect((await findSavedItem(owner, item._id))?.version).toBe(2);
  });

  it('rolls back both documents when the caller transaction aborts', async () => {
    await expect(
      mongoose.connection.transaction(async (session) => {
        await saveKnowledge(owner, source, session);
        throw new Error('Abort save');
      }),
    ).rejects.toThrow('Abort save');
    expect(await SavedItem.countDocuments()).toBe(0);
    expect(await SavedSource.countDocuments()).toBe(0);
  });

  it('deduplicates repeated sources and keeps revisions under one knowledge identity', async () => {
    const item = await save();
    await save();
    const revision = { ...source, knowledgeVersionId: new ObjectId() };
    await save(revision);
    const sessionSource = {
      ...source,
      sessionId: new ObjectId(),
      scenarioVersionId: new ObjectId(),
    };
    await save(sessionSource);
    await save(sessionSource);
    expect(await SavedItem.countDocuments()).toBe(1);
    const sources = await listSavedSources(owner, item._id);
    expect(sources).toHaveLength(3);
    expect(sources.map((entry) => entry.contextKey)).toEqual(
      expect.arrayContaining([
        `deck:${source.deckVersionId}:${source.knowledgeVersionId}`,
        `deck:${source.deckVersionId}:${revision.knowledgeVersionId}`,
        `session:${sessionSource.sessionId}:${sessionSource.scenarioVersionId}:${source.knowledgeVersionId}`,
      ]),
    );
    expect(sources.every((entry) => entry.savedItemId.equals(item._id))).toBe(
      true,
    );
    expect(
      await mongoose.connection.collection('card_progress').countDocuments(),
    ).toBe(0);
    expect(
      await mongoose.connection.collection('review_logs').countDocuments(),
    ).toBe(0);
  });

  it('scopes all reads and unsave operations to the owner', async () => {
    const item = await save();
    const other = await save(source, otherOwner);
    expect(item._id.equals(other._id)).toBe(false);
    expect(await listSavedItems(otherOwner)).toHaveLength(1);
    expect(await findSavedItem(otherOwner, item._id)).toBeNull();
    expect(await listSavedSources(otherOwner, item._id)).toEqual([]);
    const result = await mongoose.connection.transaction((session) =>
      unsaveKnowledge(otherOwner, item._id, item.version, session),
    );
    expect(result).toBeNull();
    expect((await findSavedItem(owner, item._id))?.isSaved).toBe(true);
    expect(() => listSavedItems('')).toThrow('ownerKey');
  });

  it('uses CAS for unsave and preserves sources, identity and learning progress on resave', async () => {
    const item = await save();
    const progress = mongoose.connection.collection('card_progress');
    const reviews = mongoose.connection.collection('review_logs');
    const cardKey = `knowledge:${source.knowledgeId}`;
    await progress.insertOne({ ownerKey: owner, cardKey, reps: 4 });
    await reviews.insertOne({
      ownerKey: owner,
      cardKey,
      operationId: 'existing-review',
    });
    await mongoose.connection.transaction(async (session) => {
      expect(() => unsaveKnowledge(owner, item._id, -1, session)).toThrow(
        'expectedVersion',
      );
      expect(await unsaveKnowledge(owner, item._id, 99, session)).toBeNull();
      expect(
        (await unsaveKnowledge(owner, item._id, 0, session))?.version,
      ).toBe(1);
    });
    expect(await listSavedItems(owner)).toEqual([]);
    expect(await listSavedSources(owner, item._id)).toHaveLength(1);
    const restored = await save();
    expect(restored._id.equals(item._id)).toBe(true);
    expect(restored.version).toBe(2);
    expect(await listSavedItems(owner)).toHaveLength(1);
    expect(await progress.findOne({ ownerKey: owner, cardKey })).toMatchObject({
      reps: 4,
    });
    expect(await reviews.countDocuments()).toBe(1);
  });

  it('enforces both unique indexes in MongoDB', async () => {
    const item = await save();
    await expect(
      SavedItem.create({
        ownerKey: owner,
        knowledgeId: source.knowledgeId,
        savedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
    const existing = await SavedSource.findOne({
      savedItemId: item._id,
    }).lean();
    if (!existing) throw new Error('Source was not saved');
    const duplicate = { ...existing, _id: new ObjectId() };
    await expect(SavedSource.create(duplicate)).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('rolls back the item when the source fails validation', async () => {
    await expect(
      save({ ...source, sessionId: new ObjectId() }),
    ).rejects.toThrow('Session and scenario');
    expect(await SavedItem.countDocuments()).toBe(0);
    expect(await SavedSource.countDocuments()).toBe(0);
    await expect(
      save({ ...source, scenarioVersionId: new ObjectId() }),
    ).rejects.toThrow('Session and scenario');
  });

  it('keeps guest cleanup deadlines on both documents', async () => {
    const guest = `guest:${new ObjectId()}`;
    const purgeAt = new Date(Date.now() + 60_000);
    const item = await save({ ...source, purgeAt }, guest);
    expect(item.purgeAt).toEqual(purgeAt);
    expect((await listSavedSources(guest, item._id))[0].purgeAt).toEqual(
      purgeAt,
    );
    expect(await findSavedItem(owner, item._id)).toBeNull();
  });

  it('requires a transaction for writes', async () => {
    const session = await mongoose.startSession();
    try {
      await expect(saveKnowledge(owner, source, session)).rejects.toThrow(
        'active transaction',
      );
      expect(() => unsaveKnowledge(owner, new ObjectId(), 0, session)).toThrow(
        'active transaction',
      );
    } finally {
      await session.endSession();
    }
  });
});
