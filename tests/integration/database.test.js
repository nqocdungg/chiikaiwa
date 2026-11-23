import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
import { runMigrations } from '../../server/persistence/migrations.js';
import { matchesIndexDefinition } from '../../server/persistence/index-definition.js';
import {
  databaseIndexes,
  up as applyDesignIndexes,
} from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
/** @type {string} */
let directory;
const name = '20261030000000-test-index.js';

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_foundation_test');
  db = await connectDatabase();
  directory = await mkdtemp(join(tmpdir(), 'chiikaiwa-migrations-'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(
    join(directory, name),
    'export async function up(db) { await db.collection("foundation_test").createIndex({key: 1}, {unique: true, name: "key_unique"}); }',
  );
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('MongoDB replica set', () => {
  it('reuses the connection across concurrent requests and serves a real health check', async () => {
    const connections = await Promise.all([
      connectDatabase(),
      connectDatabase(),
    ]);
    expect(connections[0]).toBe(db);
    expect(connections[1]).toBe(db);
    await request(app).get('/api/v1/health').expect(200);
  });

  it('runs a migration once, retains the unique index, and detects changed files', async () => {
    expect(await runMigrations(db, directory, true)).toEqual([
      { name, status: 'pending' },
    ]);
    await runMigrations(db, directory);
    await runMigrations(db, directory);
    expect(await db.collection('_schema_migrations').countDocuments()).toBe(1);
    const collection = db.collection('foundation_test');
    await collection.insertOne({ key: 'unique' });
    await expect(collection.insertOne({ key: 'unique' })).rejects.toMatchObject(
      { code: 11000 },
    );
    const path = join(directory, name);
    await writeFile(path, 'export async function up() {}');
    await writeFile(
      join(directory, '20261029000000-pending.js'),
      'export async function up(db) { await db.createCollection("must_not_run"); }',
    );
    await expect(runMigrations(db, directory)).rejects.toThrow(
      'Applied migration changed',
    );
    expect(await db.collection('_migration_lock').countDocuments()).toBe(0);
    expect(
      await db.listCollections({ name: 'must_not_run' }).toArray(),
    ).toEqual([]);
  });

  it('matches an index by key and options even when its name differs', () => {
    const definition = databaseIndexes.find(
      (candidate) =>
        candidate.collection === 'operation_receipts' &&
        candidate.key.operationId === 1,
    );
    if (!definition) throw new Error('Operation receipt index is missing');

    expect(
      matchesIndexDefinition(
        {
          key: definition.key,
          name: 'alternate_index_name',
          unique: true,
        },
        definition,
      ),
    ).toBe(true);
    expect(
      matchesIndexDefinition(
        {
          key: definition.key,
          name: 'alternate_index_name',
          unique: false,
        },
        definition,
      ),
    ).toBe(false);
  });

  it('applies the database design indexes safely on repeated runs', async () => {
    const users = db.collection('users');
    await users.createIndex({ emailKey: 1 }, { name: 'legacy_emailKey' });
    await expect(applyDesignIndexes(db)).rejects.toThrow(
      'Conflicting index definition on users.emailKey_unique',
    );
    await users.dropIndex('legacy_emailKey');

    await applyDesignIndexes(db);
    await applyDesignIndexes(db);

    for (const definition of databaseIndexes) {
      const indexes = await db
        .collection(definition.collection)
        .listIndexes()
        .toArray();
      const index = indexes.find(
        (candidate) => candidate.name === definition.options.name,
      );
      expect(index?.key).toEqual(definition.key);
      expect(Boolean(index?.unique)).toBe(Boolean(definition.options.unique));
      expect(index?.expireAfterSeconds ?? null).toBe(
        definition.options.expireAfterSeconds ?? null,
      );
    }

    await users.insertOne({ emailKey: 'duplicate@example.test' });
    await expect(
      users.insertOne({ emailKey: 'duplicate@example.test' }),
    ).rejects.toMatchObject({ code: 11000, keyPattern: { emailKey: 1 } });
  });

  it('commits and rolls back real multi-document transactions', async () => {
    const first = db.collection('foundation_test');
    const second = db.collection('foundation_transaction_test');
    await db.createCollection('foundation_transaction_test');
    await withTransaction(async (session) => {
      await first.insertOne({ key: 'committed-a' }, { session });
      await second.insertOne({ key: 'committed-b' }, { session });
    });
    await expect(
      withTransaction(async (session) => {
        await first.insertOne({ key: 'rolled-back-a' }, { session });
        await second.insertOne({ key: 'rolled-back-b' }, { session });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await first.countDocuments({ key: 'committed-a' })).toBe(1);
    expect(await second.countDocuments({ key: 'committed-b' })).toBe(1);
    expect(await first.countDocuments({ key: 'rolled-back-a' })).toBe(0);
    expect(await second.countDocuments({ key: 'rolled-back-b' })).toBe(0);
  });

  it('returns 503 when the previously connected database becomes unavailable', async () => {
    await disconnectDatabase();
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1');
    vi.stubEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', '100');
    await request(app).get('/api/v1/health').expect(503);
    vi.stubEnv('MONGODB_URI', replicaSet.getUri());
    await request(app).get('/api/v1/health').expect(200);
  });
});
