import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionPersonal } from '../../server/modules/learning/session-personal-model.js';
import {
  deleteSessionNote,
  findSessionPersonal,
  saveSelfAssessment,
  saveSessionNote,
} from '../../server/modules/learning/session-personal-repository.js';
import { up } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

const { ObjectId } = mongoose.Types;
const owner = `user:${new ObjectId()}`;
const otherOwner = `user:${new ObjectId()}`;
const sessionId = new ObjectId();
/** @type {MongoMemoryReplSet} */
let replicaSet;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replicaSet.getUri(), {
    dbName: 'chiikaiwa_session_personal_test',
    autoIndex: false,
    autoCreate: false,
  });
  const db = mongoose.connection.db;
  if (!db) throw new Error('Test database is not ready');
  await up(db);
});

beforeEach(async () => {
  await SessionPersonal.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

/**
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} operation
 * @returns {Promise<T>}
 */
function transact(operation) {
  return mongoose.connection.transaction(operation);
}

describe('session personal repository', () => {
  it('isolates the same session by owner and never reads by session alone', async () => {
    await transact((transaction) =>
      saveSessionNote(owner, sessionId, 0, 'Ghi chú của A', transaction),
    );
    await transact((transaction) =>
      saveSessionNote(otherOwner, sessionId, 0, 'Ghi chú của B', transaction),
    );

    expect((await findSessionPersonal(owner, sessionId))?.note).toBe(
      'Ghi chú của A',
    );
    expect((await findSessionPersonal(otherOwner, sessionId))?.note).toBe(
      'Ghi chú của B',
    );
    expect(await SessionPersonal.countDocuments({ sessionId })).toBe(2);
    expect(
      await findSessionPersonal(`user:${new ObjectId()}`, sessionId),
    ).toBeNull();
  });

  it('enforces the owner-session unique index in MongoDB', async () => {
    await SessionPersonal.create({ ownerKey: owner, sessionId });
    await expect(
      SessionPersonal.create({ ownerKey: owner, sessionId }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await SessionPersonal.countDocuments()).toBe(1);
  });

  it('uses independent CAS versions for note and self-assessment', async () => {
    const note = await transact((transaction) =>
      saveSessionNote(owner, sessionId, 0, 'Bản một', transaction),
    );
    expect(note).toMatchObject({ noteVersion: 1, version: 0 });

    const assessment = await transact((transaction) =>
      saveSelfAssessment(
        owner,
        sessionId,
        0,
        { confidence: 4, comment: 'Ổn' },
        transaction,
      ),
    );
    expect(assessment).toMatchObject({ noteVersion: 1, version: 1 });
    expect(assessment?.note).toBe('Bản một');

    expect(
      await transact((transaction) =>
        saveSessionNote(owner, sessionId, 0, 'Ghi đè stale', transaction),
      ),
    ).toBeNull();
    const updated = await transact((transaction) =>
      saveSessionNote(owner, sessionId, 1, 'Bản hai', transaction),
    );
    expect(updated).toMatchObject({
      note: 'Bản hai',
      noteVersion: 2,
      version: 1,
    });
  });

  it('allows only one competing write for the same assessment version', async () => {
    await SessionPersonal.create({ ownerKey: owner, sessionId });
    const outcomes = await Promise.all([
      transact((transaction) =>
        saveSelfAssessment(owner, sessionId, 0, { confidence: 2 }, transaction),
      ),
      transact((transaction) =>
        saveSelfAssessment(owner, sessionId, 0, { confidence: 5 }, transaction),
      ),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((value) => value === null)).toHaveLength(1);
    expect((await findSessionPersonal(owner, sessionId))?.version).toBe(1);
    expect(await SessionPersonal.countDocuments()).toBe(1);
  });

  it('deletes only the note and preserves self-assessment', async () => {
    await transact((transaction) =>
      saveSessionNote(owner, sessionId, 0, 'Sẽ xóa', transaction),
    );
    await transact((transaction) =>
      saveSelfAssessment(
        owner,
        sessionId,
        0,
        { confidence: 3, comment: 'Giữ lại' },
        transaction,
      ),
    );
    const deleted = await transact((transaction) =>
      deleteSessionNote(owner, sessionId, 1, transaction),
    );
    expect(deleted?.toObject()).not.toHaveProperty('note');
    expect(deleted).toMatchObject({
      noteVersion: 2,
      version: 1,
      selfAssessment: { confidence: 3, comment: 'Giữ lại' },
    });
    expect(
      await transact((transaction) =>
        deleteSessionNote(owner, sessionId, 1, transaction),
      ),
    ).toBeNull();
  });

  it('keeps a guest cleanup deadline and scopes writes to the owner', async () => {
    const guest = `guest:${new ObjectId()}`;
    const purgeAt = new Date(Date.now() + 60_000);
    const personal = await transact((transaction) =>
      saveSessionNote(guest, sessionId, 0, 'Tạm thời', transaction, {
        purgeAt,
      }),
    );
    expect(personal?.purgeAt).toEqual(purgeAt);
    expect(await findSessionPersonal(owner, sessionId)).toBeNull();
    expect((await findSessionPersonal(guest, sessionId))?.note).toBe(
      'Tạm thời',
    );
  });

  it('requires valid owners, versions and an active transaction', async () => {
    const mongoSession = await mongoose.startSession();
    try {
      await expect(
        saveSessionNote(owner, sessionId, 0, 'Note', mongoSession),
      ).rejects.toThrow('active transaction');
      expect(() => findSessionPersonal('', sessionId)).toThrow('ownerKey');
      expect(() =>
        deleteSessionNote(owner, sessionId, -1, mongoSession),
      ).toThrow('expectedVersion');
    } finally {
      await mongoSession.endSession();
    }
  });
});
