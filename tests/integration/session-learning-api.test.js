import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  createFixtureJwt,
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
  DEFAULT_JWT_SECRET,
  FIXTURE_SESSION_IDS,
  FIXTURE_USER_IDS,
} from '../fixtures/auth-fixtures.js';
import { CONTENT_FIXTURES } from '../fixtures/content-fixtures.js';
import {
  buildCookieHeader,
  createTestIdempotencyKey,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';

const { ObjectId } = mongoose.Types;
const app = createApp();
const origin = 'http://127.0.0.1:5173';
const sessionId = CONTENT_FIXTURES.sessionWithMembers._id;
const ownerA = `user:${FIXTURE_USER_IDS.learnerA}`;
const ownerB = `user:${FIXTURE_USER_IDS.learnerB}`;

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
/** @type {Awaited<ReturnType<typeof fetchCsrfContext>>} */
let csrf;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  vi.stubEnv('JWT_ISSUER', DEFAULT_JWT_ISSUER);
  vi.stubEnv('JWT_AUDIENCE', DEFAULT_JWT_AUDIENCE);
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_session_learning_api_test');
  vi.stubEnv('APP_ORIGIN', origin);
  db = await connectDatabase();
  await applyIndexes(db);
  csrf = await fetchCsrfContext(app);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await seedContractFixtures(db);
  for (const collection of [
    'session_personal',
    'session_cards',
    'saved_items',
    'saved_sources',
    'quiz_attempts',
    'operation_receipts',
  ]) {
    await db.collection(collection).deleteMany({});
  }
});

/** @param {'learnerA'|'learnerB'} user */
function authCookie(user) {
  return createFixtureJwt({
    sub: FIXTURE_USER_IDS[user],
    sid: FIXTURE_SESSION_IDS[user],
  });
}

/** @param {'get'|'put'|'delete'} method @param {string} path @param {'learnerA'|'learnerB'} [user] @param {string} [key] */
function api(method, path, user = 'learnerA', key) {
  const call = request(app)
    [method](path)
    .set(
      'Cookie',
      buildCookieHeader({
        authCookie: authCookie(user),
        csrfCookie: csrf.csrfCookie,
      }),
    );
  if (method !== 'get') {
    call
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.csrfToken)
      .set('Idempotency-Key', key ?? createTestIdempotencyKey());
  }
  return call;
}

describe('BE-021 personal session APIs', () => {
  it('keeps note and assessment versions independent and isolates both owners', async () => {
    const notePath = `/api/v1/sessions/${sessionId}/note`;
    const assessmentPath = `/api/v1/sessions/${sessionId}/self-assessment`;
    const personalPath = `/api/v1/sessions/${sessionId}/personal`;

    const note = await api('put', notePath)
      .send({ expectedVersion: 0, note: 'Ghi chú riêng A' })
      .expect(200);
    expect(note.body.data).toMatchObject({ noteVersion: 1, version: 0 });

    const assessment = await api('put', assessmentPath)
      .send({ expectedVersion: 0, confidence: 5, comment: 'Tự tin' })
      .expect(200);
    expect(assessment.body.data).toMatchObject({
      note: 'Ghi chú riêng A',
      noteVersion: 1,
      version: 1,
      selfAssessment: { confidence: 5, comment: 'Tự tin' },
    });

    await api('put', notePath)
      .send({ expectedVersion: 0, note: 'Ghi đè stale' })
      .expect(409);
    const other = await api('get', personalPath, 'learnerB').expect(200);
    expect(other.body.data).toEqual({
      sessionId: String(sessionId),
      noteVersion: 0,
      version: 0,
    });
  });

  it('replays writes and deletes only note while retaining self-assessment', async () => {
    const notePath = `/api/v1/sessions/${sessionId}/note`;
    const assessmentPath = `/api/v1/sessions/${sessionId}/self-assessment`;
    const key = createTestIdempotencyKey();
    const body = { expectedVersion: 0, note: 'Một lần' };
    const first = await api('put', notePath, 'learnerA', key)
      .send(body)
      .expect(200);
    const replay = await api('put', notePath, 'learnerA', key)
      .send(body)
      .expect(200);
    expect(replay.body.data).toEqual(first.body.data);
    await api('put', assessmentPath)
      .send({ expectedVersion: 0, confidence: 3 })
      .expect(200);

    const deleteKey = createTestIdempotencyKey();
    await api(
      'delete',
      `${notePath}?expectedVersion=1`,
      'learnerA',
      deleteKey,
    ).expect(204);
    await api(
      'delete',
      `${notePath}?expectedVersion=1`,
      'learnerA',
      deleteKey,
    ).expect(204);
    const stored = await db.collection('session_personal').findOne({
      ownerKey: ownerA,
      sessionId,
    });
    expect(stored).not.toHaveProperty('note');
    expect(stored).toMatchObject({
      noteVersion: 2,
      version: 1,
      selfAssessment: { confidence: 3 },
    });
  });

  it('validates confidence and Unicode code-point limits without writing', async () => {
    const assessmentPath = `/api/v1/sessions/${sessionId}/self-assessment`;
    await api('put', assessmentPath)
      .send({ expectedVersion: 0, confidence: 0 })
      .expect(422);
    await api('put', `/api/v1/sessions/${sessionId}/note`)
      .send({ expectedVersion: 0, note: '😀'.repeat(10_001) })
      .expect(422);
    expect(await db.collection('session_personal').countDocuments()).toBe(0);
  });
});

describe('BE-021 session summary and history APIs', () => {
  it('returns an ended summary with only caller-owned sources, quizzes and note', async () => {
    const scenarioVersionId = new ObjectId();
    const deckVersionId = new ObjectId();
    const knowledgeA = new ObjectId();
    const knowledgeB = new ObjectId();
    const cardId = new ObjectId();
    const savedItemA = new ObjectId();
    const savedItemB = new ObjectId();
    const endedAt = new Date('2026-11-05T08:10:00.000Z');
    await db.collection('practice_sessions').updateOne(
      { _id: sessionId },
      {
        $set: {
          status: 'ended',
          endedAt,
          endReason: 'left',
          deckVersionId,
          currentCardId: cardId,
          selectionRemainingMs: 0,
        },
      },
    );
    await db.collection('session_cards').insertOne({
      _id: cardId,
      sessionId,
      scenarioVersionId,
      slot: 0,
      status: 'unfinished',
      drawnAt: new Date('2026-11-05T08:02:00.000Z'),
      finishedAt: endedAt,
      roleAKey: ownerA,
      roleBKey: ownerB,
    });
    await db.collection('content_versions').insertOne({
      _id: scenarioVersionId,
      contentId: new ObjectId(),
      kind: 'scenario',
      revision: 1,
      payload: {
        title: 'Ở quán cà phê',
        context: 'Bối cảnh',
        objective: 'Mục tiêu',
        roleA: 'Vai A',
        roleB: 'Vai B',
      },
    });
    await db.collection('session_personal').insertMany([
      {
        ownerKey: ownerA,
        sessionId,
        note: 'NOTE_A_ONLY',
        noteVersion: 1,
        version: 0,
      },
      {
        ownerKey: ownerB,
        sessionId,
        note: 'NOTE_B_SENTINEL',
        noteVersion: 1,
        version: 0,
      },
    ]);
    await db.collection('saved_sources').insertMany([
      {
        savedItemId: savedItemA,
        ownerKey: ownerA,
        knowledgeId: new ObjectId(),
        knowledgeVersionId: knowledgeA,
        contextKey: 'source-a',
        deckVersionId,
        sessionId,
        scenarioVersionId,
        createdAt: new Date(),
      },
      {
        savedItemId: savedItemB,
        ownerKey: ownerB,
        knowledgeId: new ObjectId(),
        knowledgeVersionId: knowledgeB,
        contextKey: 'source-b',
        deckVersionId,
        sessionId,
        scenarioVersionId,
        createdAt: new Date(),
      },
    ]);
    await db.collection('quiz_attempts').insertMany([
      {
        ownerKey: ownerA,
        deckVersionId,
        sourceSessionId: sessionId,
        status: 'submitted',
        total: 1,
        score: 1,
        createdAt: new Date(),
      },
      {
        ownerKey: ownerB,
        deckVersionId,
        sourceSessionId: sessionId,
        status: 'submitted',
        total: 1,
        score: 0,
        createdAt: new Date(),
      },
    ]);

    const response = await api(
      'get',
      `/api/v1/sessions/${sessionId}/summary`,
    ).expect(200);
    expect(response.body.data.personal.note).toBe('NOTE_A_ONLY');
    expect(response.body.data.drawnCards).toMatchObject([
      { title: 'Ở quán cà phê', status: 'unfinished' },
    ]);
    expect(response.body.data.savedSources).toHaveLength(1);
    expect(response.body.data.savedSources[0].knowledgeVersionId).toBe(
      String(knowledgeA),
    );
    expect(response.body.data.quizAttempts).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('NOTE_B_SENTINEL');
    expect(JSON.stringify(response.body)).not.toContain(String(knowledgeB));
  });

  it('rejects summary before ended and excludes unstarted rooms from history', async () => {
    await api('get', `/api/v1/sessions/${sessionId}/summary`).expect(409);
    await db.collection('practice_sessions').insertOne({
      _id: new ObjectId(),
      originKind: 'invite',
      originId: new ObjectId(),
      roomName: 'never-started',
      status: 'preparing',
      version: 0,
      members: CONTENT_FIXTURES.sessionWithMembers.members,
      activeDurationMs: 0,
      presence: [],
      screenShare: { state: 'idle', version: 0 },
    });
    const response = await api('get', '/api/v1/me/sessions?limit=1').expect(
      200,
    );
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].id).toBe(String(sessionId));
    expect(response.body.data.items[0]).not.toHaveProperty('currentCard');
    expect(response.body.data.items[0]).not.toHaveProperty('slots');
  });
});
