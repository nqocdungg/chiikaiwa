import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
  FIXTURE_GUEST_IDS,
  FIXTURE_PRACTICE_SESSION_ID,
  FIXTURE_SESSION_IDS,
  FIXTURE_USER_IDS,
  RAW_GUEST_TOKENS,
} from '../fixtures/auth-fixtures.js';
import { CONTENT_FIXTURES } from '../fixtures/content-fixtures.js';
import {
  assertSuccessEnvelope,
  buildCookieHeader,
  createTestIdempotencyKey,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';

const { ObjectId } = mongoose.Types;
const app = createApp();
const origin = 'http://127.0.0.1:5173';
const path = '/api/v1/me/saved-items';
const learner = `user:${FIXTURE_USER_IDS.learnerA}`;
const guest = `guest:${FIXTURE_GUEST_IDS.active}`;
const knowledge = CONTENT_FIXTURES.knowledgeVersion;
const deck = new ObjectId();
const scenario = new ObjectId();
const otherScenario = new ObjectId();
const sessionId = CONTENT_FIXTURES.sessionWithMembers._id;
const trialId = new ObjectId(FIXTURE_PRACTICE_SESSION_ID);
const input = {
  knowledgeVersionId: String(knowledge._id),
  deckVersionId: String(deck),
};
const sessionInput = {
  ...input,
  sessionId: String(sessionId),
  scenarioVersionId: String(scenario),
};

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
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_saved_item_api_test');
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

/** @param {'learnerA'|'learnerB'|'admin'} [user] */
function account(user = 'learnerA') {
  return createFixtureJwt({
    sub: FIXTURE_USER_IDS[user],
    sid: FIXTURE_SESSION_IDS[user],
  });
}

/** @param {'get'|'post'|'delete'} method @param {string} [suffix] @param {{ user?: 'learnerA'|'learnerB'|'admin', guest?: boolean, key?: string }} [options] */
function api(method, suffix = '', options = {}) {
  const call = request(app)
    [method](path + suffix)
    .set(
      'Cookie',
      buildCookieHeader({
        ...(options.guest
          ? { guestCookie: RAW_GUEST_TOKENS.active }
          : { authCookie: account(options.user) }),
        csrfCookie: csrf.csrfCookie,
      }),
    );
  if (method !== 'get') {
    call
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.csrfToken)
      .set('Idempotency-Key', options.key ?? createTestIdempotencyKey());
  }
  return call;
}

beforeEach(async () => {
  await seedContractFixtures(db);
  for (const name of [
    'saved_items',
    'saved_sources',
    'session_cards',
    'card_progress',
    'review_logs',
    'operation_receipts',
  ]) {
    await db.collection(name).deleteMany({});
  }
  const deckItemId = new ObjectId();
  await db.collection('content_items').insertOne({
    _id: deckItemId,
    kind: 'deck',
    status: 'published',
    publishedVersionId: deck,
  });
  await db.collection('content_versions').insertMany([
    {
      _id: deck,
      kind: 'deck',
      contentId: deckItemId,
      revision: 1,
      payload: {
        knowledgeVersionIds: [knowledge._id],
        scenarioVersionIds: [scenario, otherScenario],
      },
    },
    ...[scenario, otherScenario].map((_id) => ({
      _id,
      contentId: new ObjectId(),
      kind: 'scenario',
      revision: 1,
      payload: { knowledgeVersionIds: [knowledge._id] },
    })),
  ]);
  await db.collection('practice_sessions').updateOne(
    { _id: sessionId },
    {
      $set: { deckVersionId: deck },
    },
  );
  await db.collection('session_cards').insertMany([
    {
      sessionId,
      scenarioVersionId: scenario,
      slot: 0,
      status: 'completed',
      drawnAt: new Date(),
    },
    {
      sessionId,
      scenarioVersionId: otherScenario,
      slot: 1,
      status: 'faceDown',
    },
  ]);
});

it('keeps one item and multiple sources through save, unsave, retry and resave (DB-T08)', async () => {
  const progress = {
    ownerKey: learner,
    cardKey: `knowledge:${knowledge.contentId}`,
    dueAt: new Date(),
    version: 8,
  };
  await db.collection('card_progress').insertOne(progress);
  const before = await db
    .collection('card_progress')
    .findOne({ ownerKey: learner });
  const first = await api('post').send(input);
  assertSuccessEnvelope(first);
  const id = first.body.data.id;
  const key = createTestIdempotencyKey();
  const second = await api('post', '', { key }).send(sessionInput).expect(200);
  expect(second.body.data).toMatchObject({ id, version: 1 });
  const retry = await api('post', '', { key }).send(sessionInput).expect(200);
  expect(retry.body.data).toEqual(second.body.data);
  expect(
    (await api('post', '', { key }).send(input).expect(409)).body.error.code,
  ).toBe('IDEMPOTENCY_CONFLICT');
  expect(await db.collection('saved_items').countDocuments()).toBe(1);
  const firstPage = await api('get', `/${id}/sources?limit=1`).expect(200);
  expect(firstPage.body.data.items).toMatchObject([sessionInput]);
  const secondPage = await api(
    'get',
    `/${id}/sources?cursor=${firstPage.body.data.nextCursor}`,
  ).expect(200);
  expect(secondPage.body.data.items).toMatchObject([input]);
  expect(secondPage.body.data.items[0]).not.toHaveProperty('sessionId');
  expect(secondPage.body.data.items[0]).not.toHaveProperty('scenarioVersionId');
  expect(
    (await api('get', `?sessionId=${sessionId}`).expect(200)).body.data.items,
  ).toMatchObject([{ id }]);
  await api('delete', `/${id}?expectedVersion=0`).expect(409);
  const removeKey = createTestIdempotencyKey();
  await api('delete', `/${id}?expectedVersion=1`, { key: removeKey }).expect(
    204,
  );
  await api('delete', `/${id}?expectedVersion=1`, { key: removeKey }).expect(
    204,
  );
  expect((await api('get').expect(200)).body.data.items).toEqual([]);
  expect(
    (await api('get', `/${id}/sources`).expect(200)).body.data.items,
  ).toHaveLength(2);
  await api('post', '', { key }).send(sessionInput).expect(404);
  expect((await api('post').send(input).expect(200)).body.data).toMatchObject({
    id,
    version: 3,
  });
  expect(await db.collection('saved_sources').countDocuments()).toBe(2);
  expect(
    await db.collection('card_progress').findOne({ ownerKey: learner }),
  ).toEqual(before);
  expect(await db.collection('review_logs').countDocuments()).toBe(0);
});

it('rejects owner forgery, mismatched sources, face-down cards and cross-owner access', async () => {
  await api('post')
    .send({ ...input, ownerKey: learner })
    .expect(422);
  await api('post')
    .send({ ...input, sessionId: String(sessionId) })
    .expect(422);
  await api('post')
    .send({ ...sessionInput, sessionId: String(new ObjectId()) })
    .expect(404);
  await api('post')
    .send({ ...sessionInput, scenarioVersionId: String(otherScenario) })
    .expect(404);
  await api('post')
    .send({ ...input, knowledgeVersionId: String(scenario) })
    .expect(404);
  await api('post', '', { user: 'admin' }).send(sessionInput).expect(404);
  expect(await db.collection('saved_items').countDocuments()).toBe(0);
  expect(await db.collection('operation_receipts').countDocuments()).toBe(0);
  const created = await api('post').send(input).expect(200);
  const id = created.body.data.id;
  await api('get', `/${id}/sources`, { user: 'learnerB' }).expect(404);
  await api('delete', `/${id}?expectedVersion=0`, { user: 'admin' }).expect(
    404,
  );
  await api('get', '?cursor=invalid').expect(400);
});

it('keeps both drawn sources when two first saves arrive together', async () => {
  await db
    .collection('session_cards')
    .updateOne(
      { sessionId, scenarioVersionId: otherScenario },
      { $set: { status: 'current', drawnAt: new Date() } },
    );
  const [first, second] = await Promise.all([
    api('post').send(sessionInput).expect(200),
    api('post')
      .send({ ...sessionInput, scenarioVersionId: String(otherScenario) })
      .expect(200),
  ]);
  expect(first.body.data.id).toBe(second.body.data.id);
  const list = await api('get', `/${first.body.data.id}/sources`).expect(200);
  expect(
    list.body.data.items
      .map(
        (/** @type {{scenarioVersionId: string}} */ source) =>
          source.scenarioVersionId,
      )
      .sort(),
  ).toEqual([String(scenario), String(otherScenario)].sort());
  expect(await db.collection('saved_items').countDocuments()).toBe(1);
});

it('paginates saved items by savedAt and binds the cursor to owner and session filter', async () => {
  const earlier = await api('post').send(sessionInput).expect(200);
  const another = {
    ...knowledge,
    _id: new ObjectId(),
    contentId: new ObjectId(),
  };
  await db.collection('content_versions').insertOne(another);
  await db.collection('content_items').insertOne({
    ...CONTENT_FIXTURES.knowledge,
    _id: another.contentId,
    publishedVersionId: another._id,
  });
  await db
    .collection('content_versions')
    .updateOne(
      { _id: deck },
      { $set: { 'payload.knowledgeVersionIds': [knowledge._id, another._id] } },
    );
  const later = await api('post')
    .send({ ...input, knowledgeVersionId: String(another._id) })
    .expect(200);
  const first = await api('get', '?limit=1').expect(200);
  expect(first.body.data.items).toMatchObject([{ id: later.body.data.id }]);
  const cursor = first.body.data.nextCursor;
  expect(cursor).toEqual(expect.any(String));
  const second = await api('get', `?limit=1&cursor=${cursor}`).expect(200);
  expect(second.body.data).toMatchObject({
    items: [{ id: earlier.body.data.id }],
    nextCursor: null,
  });
  await api('get', `?cursor=${cursor}`, { user: 'learnerB' }).expect(400);
  await api('get', `?sessionId=${sessionId}&cursor=${cursor}`).expect(400);
});

it('checks membership again on replay and preserves an old source after publication', async () => {
  const key = createTestIdempotencyKey();
  const saved = await api('post', '', { key }).send(sessionInput).expect(200);
  const latest = new ObjectId();
  await db.collection('content_versions').insertOne({
    ...knowledge,
    _id: latest,
    revision: 2,
    payload: { ...knowledge.payload, meaning: 'Bản mới' },
  });
  await db
    .collection('content_items')
    .updateOne(
      { _id: knowledge.contentId },
      { $set: { publishedVersionId: latest } },
    );
  expect(
    (await api('get').expect(200)).body.data.items[0].knowledge.versionId,
  ).toBe(String(latest));
  expect(
    (await api('get', `/${saved.body.data.id}/sources`).expect(200)).body.data
      .items[0].knowledgeVersionId,
  ).toBe(String(knowledge._id));
  await db
    .collection('practice_sessions')
    .updateOne({ _id: sessionId }, { $set: { members: [] } });
  await api('post', '', { key }).send(sessionInput).expect(404);
  expect(await db.collection('saved_sources').countDocuments()).toBe(1);
});

it('keeps guest saved-item responses on the revision allowed by the trial after republish', async () => {
  await db.collection('practice_sessions').insertOne({
    _id: trialId,
    originKind: 'invitation',
    originId: new ObjectId(),
    roomName: 'saved-api-republish-trial',
    members: [{ actorKey: learner }, { actorKey: guest }],
    deckVersionId: deck,
  });
  await db
    .collection('guest_sessions')
    .updateOne(
      { _id: new ObjectId(FIXTURE_GUEST_IDS.active) },
      { $set: { status: 'active' } },
    );
  const key = createTestIdempotencyKey();
  const first = await api('post', '', { guest: true, key })
    .send(input)
    .expect(200);
  const savedId = first.body.data.id;
  const newer = new ObjectId();
  await db.collection('content_versions').insertOne({
    ...knowledge,
    _id: newer,
    revision: 2,
    payload: { ...knowledge.payload, meaning: 'Bản ngoài lượt thử' },
  });
  await db
    .collection('content_items')
    .updateOne(
      { _id: knowledge.contentId },
      { $set: { publishedVersionId: newer, latestRevision: 2 } },
    );

  const replay = await api('post', '', { guest: true, key })
    .send(input)
    .expect(200);
  const listed = await api('get', '', { guest: true }).expect(200);
  const savedAgain = await api('post', '', { guest: true })
    .send(input)
    .expect(200);
  for (const dto of [
    replay.body.data,
    ...listed.body.data.items,
    savedAgain.body.data,
  ]) {
    expect(dto).toMatchObject({
      id: savedId,
      knowledge: {
        versionId: String(knowledge._id),
        meaning: knowledge.payload.meaning,
      },
    });
  }
  expect(listed.body.data.items).toHaveLength(1);
  expect(replay.body.data.version).toBe(first.body.data.version);
  expect(
    await db.collection('saved_sources').countDocuments({ ownerKey: guest }),
  ).toBe(1);
});

it('guards guest writes and replays against the trial and its deadline', async () => {
  const expiresAt = new Date(Date.now() + 300_000);
  await db.collection('practice_sessions').insertOne({
    _id: trialId,
    originKind: 'invitation',
    originId: new ObjectId(),
    roomName: 'saved-api-trial',
    members: [{ actorKey: learner }, { actorKey: guest }],
    deckVersionId: deck,
    endedAt: new Date(expiresAt.getTime() - 900_000),
  });
  const guests = db.collection('guest_sessions');
  const filter = { _id: new ObjectId(FIXTURE_GUEST_IDS.active) };
  await guests.updateOne(filter, { $set: { status: 'summary', expiresAt } });
  const previous = await guests.findOne(filter);
  const key = createTestIdempotencyKey();
  await api('post', '', { guest: true }).send(sessionInput).expect(404);
  const saved = await api('post', '', { guest: true, key })
    .send(input)
    .expect(200);
  await api('post', '', { guest: true, key }).send(input).expect(200);
  expect((await guests.findOne(filter))?.version).toBe(previous?.version + 1);
  expect(
    (await db.collection('saved_items').findOne({ ownerKey: guest }))?.purgeAt,
  ).toEqual(expiresAt);
  expect(
    (await db.collection('saved_sources').findOne({ ownerKey: guest }))
      ?.purgeAt,
  ).toEqual(expiresAt);
  await api('get', `/${saved.body.data.id}/sources`).expect(404);
  await guests.updateOne(filter, { $set: { expiresAt: new Date(0) } });
  expect(
    (await api('post', '', { guest: true, key }).send(input).expect(410)).body
      .error.code,
  ).toBe('GUEST_EXPIRED');
  await api('get', '', { guest: true }).expect(410);
});
