import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  getTopicVersionDetail,
  getTopicVersionKnowledge,
  listPublishedTopics,
} from '../../server/modules/content/content-service.js';
import { resolveDeckManifest } from '../../server/modules/content/content-validator.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { seedContentDataset } from '../../server/persistence/seed/seed-content.js';
import { prepareTopicContentV2 } from '../../server/persistence/seed/topic-content-v2.js';

const { ObjectId } = mongoose.Types;

/** @type {MongoMemoryReplSet | undefined} */
let replicaSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_test_topic_content_v2');
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

it('nạp học liệu v2, nạp lại và đọc danh mục trên replica set cô lập', async () => {
  const db = await connectDatabase();
  await applyDesignIndexes(db);

  const dataset = prepareTopicContentV2();
  const options = {
    datasetName: 'topic-content-v2',
    warnOnMissingAdmin: false,
  };
  const first = await seedContentDataset(db, dataset, options);
  expect(first.errors).toEqual([]);
  expect(first.success).toBe(true);
  expect(first.records).toHaveLength(753);
  expect(first.records.every(({ action }) => action === 'inserted')).toBe(true);

  const second = await seedContentDataset(db, dataset, options);
  expect(second.errors).toEqual([]);
  expect(second.success).toBe(true);
  expect(second.records).toHaveLength(first.records.length);
  expect(second.records.every(({ action }) => action === 'unchanged')).toBe(
    true,
  );
  expect(await db.collection('content_items').countDocuments()).toBe(753);
  const versions = db.collection('content_versions');
  expect(await versions.countDocuments()).toBe(753);

  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    const { items } = await listPublishedTopics({ level });
    expect(items).toHaveLength(4);
    expect(items.every((topic) => topic.level === level)).toBe(true);
  }

  for (const { versionId } of dataset.decks) {
    const version = await versions.findOne({ _id: new ObjectId(versionId) });
    expect(version?.payload.scenarioVersionIds).toHaveLength(3);
    const { errors } = await resolveDeckManifest(db, version?.payload);
    expect(errors).toEqual([]);
    const detail = await getTopicVersionDetail({ versionId });
    const knowledge = await getTopicVersionKnowledge({ versionId, limit: 50 });
    expect(detail.questionCount).toBe(
      version?.payload.questionVersionIds.length,
    );
    expect(knowledge.items).toHaveLength(detail.knowledgeCount);
    const knowledgeTypes = knowledge.items.map(
      (/** @type {{ type: string }} */ item) => item.type,
    );
    expect(new Set(knowledgeTypes)).toEqual(new Set(['vocabulary', 'grammar']));
  }
}, 120000);
