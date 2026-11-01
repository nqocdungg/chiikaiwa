import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { runMigrations } from '../../server/persistence/migrations.js';

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

  it('commits and rolls back real multi-document transactions', async () => {
    const collection = db.collection('foundation_test');
    await mongoose.connection.transaction(
      async (session) => {
        await collection.insertOne({ key: 'committed-a' }, { session });
        await collection.insertOne({ key: 'committed-b' }, { session });
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
    await expect(
      mongoose.connection.transaction(async (session) => {
        await collection.insertOne({ key: 'rolled-back-a' }, { session });
        await collection.insertOne({ key: 'rolled-back-b' }, { session });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await collection.countDocuments({ key: /^committed-/u })).toBe(2);
    expect(await collection.countDocuments({ key: /^rolled-back-/u })).toBe(0);
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
