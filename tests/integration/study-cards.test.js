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
import { readAuthEnv } from '../../server/config/env.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
import { verifyReviewTicket } from '../../server/modules/learning/review-ticket.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  FIXTURE_GUEST_IDS,
  FIXTURE_PRACTICE_SESSION_ID,
  FIXTURE_SESSION_IDS,
  FIXTURE_USER_IDS,
  RAW_GUEST_TOKENS,
} from '../fixtures/auth-fixtures.js';
import {
  CONTENT_FIXTURES,
  FIXTURE_CONTENT_IDS,
  FIXTURE_VERSION_IDS,
} from '../fixtures/content-fixtures.js';
import {
  assertSuccessEnvelope,
  buildCookieHeader,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';
import {
  prepareStudyCardReveal,
  queryStudyCards,
} from '../../server/modules/learning/study-card-service.js';
import { schedulerConfig } from '../../server/integrations/fsrs-config.js';
import { up as registerScheduler } from '../../server/persistence/migrations/20261115000100-register-fsrs-six-config.js';

const ownerKey = 'user:657f1f77bcf86cd799439001';
const otherOwnerKey = 'user:657f1f77bcf86cd799439002';
const now = new Date('2026-11-14T10:00:00.000Z');
const scope = /** @type {const} */ ({
  type: 'topic',
  topicVersionId: '657f1f77bcf86cd799439010',
});
const cards = [1, 2, 3, 4].map((n) => ({
  cardKey: `knowledge:657f1f77bcf86cd79943903${n}`,
  front: `Question ${n}`,
  back: `Answer ${n}`,
  contentVersionId: `757f1f77bcf86cd79943903${n}`,
  position: {
    time: Date.UTC(2026, 10, n < 3 ? 3 : 2),
    id: `657f1f77bcf86cd79943903${n}`,
  },
}));
const input = { ownerKey, scope, now, cards };
const origin = 'http://127.0.0.1:5173';
const app = createApp();
const { ObjectId } = mongoose.Types;
const learner = `user:${FIXTURE_USER_IDS.learnerA}`;
const knowledgeKey = `knowledge:${FIXTURE_CONTENT_IDS.knowledgeA}`;
const guestKey = `guest:${FIXTURE_GUEST_IDS.active}`;
const topic = {
  type: 'topic',
  topicVersionId: FIXTURE_VERSION_IDS.deckAVersion,
};
const latestId = new ObjectId();
const deckId = new ObjectId();

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_study_cards_test');
  vi.stubEnv('APP_ORIGIN', origin);
  db = await connectDatabase();
  await applyDesignIndexes(db);
  await registerScheduler(db);
});

/** @param {'query' | 'reveal'} action @param {object} body @param {{authCookie?: string, guestCookie?: string}} [cookies] */
async function studyRequest(action, body, cookies = {}) {
  const { csrfCookie, csrfToken } = await fetchCsrfContext(app);
  return request(app)
    .post(`/api/v1/study/cards/${action}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .set('Cookie', buildCookieHeader({ ...cookies, csrfCookie }))
    .send(body);
}

/** @param {'learnerA' | 'learnerB' | 'admin'} [user] */
function account(user = 'learnerA') {
  const { jwtIssuer, jwtAudience, jwtSecret } = readAuthEnv();
  const iat = Math.floor(Date.now() / 1000);
  return {
    authCookie: signJwt(
      {
        sub: FIXTURE_USER_IDS[user],
        sid: FIXTURE_SESSION_IDS[user],
        authVersion: 0,
        iat,
        exp: iat + 3600,
      },
      jwtSecret,
      { issuer: jwtIssuer, audience: jwtAudience },
    ),
  };
}

describe('BE-014 HTTP', () => {
  beforeEach(async () => {
    await seedContractFixtures(db);
    for (const collection of [
      'personal_decks',
      'deck_entries',
      'saved_items',
      'saved_sources',
    ]) {
      await db.collection(collection).deleteMany({});
    }
    const knowledge = CONTENT_FIXTURES.knowledgeVersion;
    await db.collection('content_versions').insertMany([
      {
        ...knowledge,
        _id: latestId,
        revision: 2,
        payload: { ...knowledge.payload, meaning: 'Xin chào từ bản mới' },
      },
      {
        _id: new ObjectId(topic.topicVersionId),
        contentId: new ObjectId(FIXTURE_CONTENT_IDS.deckA),
        kind: 'deck',
        revision: 1,
        payload: { knowledgeVersionIds: [knowledge._id] },
      },
    ]);
    await db
      .collection('content_items')
      .updateOne(
        { _id: knowledge.contentId },
        { $set: { publishedVersionId: latestId, latestRevision: 2 } },
      );
    await db.collection('content_items').insertOne({
      _id: new ObjectId(FIXTURE_CONTENT_IDS.deckA),
      kind: 'deck',
      status: 'published',
      publishedVersionId: new ObjectId(topic.topicVersionId),
    });
    await db.collection('saved_items').insertOne({
      ownerKey: learner,
      knowledgeId: knowledge.contentId,
      isSaved: true,
      savedAt: new Date(),
    });
  });

  it('serves the latest published revision in topic and saved, signs the shown revision and leaves DB-T11 data unchanged', async () => {
    const cookie = account();
    const configBefore = await db.collection('scheduler_configs').findOne();
    const statsBefore = await db.collection('statistics').findOne();
    const receiptsBefore = await db
      .collection('operation_receipts')
      .countDocuments();
    const query = await studyRequest(
      'query',
      { scope: topic, mode: 'due' },
      cookie,
    );
    assertSuccessEnvelope(query);
    expect(query.body.data).toEqual({
      items: [
        {
          cardKey: knowledgeKey,
          front: 'こんにちは',
          contentVersionId: String(latestId),
          progress: {
            cardKey: knowledgeKey,
            state: 'new',
            version: 0,
            reps: 0,
            lapses: 0,
          },
        },
      ],
      nextCursor: null,
    });
    const saved = await studyRequest(
      'query',
      { scope: { type: 'saved' }, mode: 'all' },
      cookie,
    );
    expect(saved.body.data).toEqual(query.body.data);
    const opened = await studyRequest(
      'reveal',
      { scope: topic, cardKey: knowledgeKey },
      cookie,
    );
    assertSuccessEnvelope(opened);
    const { back, reviewTicket, ticketExpiresAt, preview } = opened.body.data;
    expect(back).toContain('Xin chào từ bản mới\n\nCách đọc: konnichiwa');
    expect(back).toContain(
      CONTENT_FIXTURES.knowledgeVersion.payload.examples[0].vietnamese,
    );
    expect(
      preview.map((/** @type {{rating: number}} */ item) => item.rating),
    ).toEqual([1, 2, 3]);
    const issuedAt = new Date(opened.body.meta.serverTime);
    expect(Date.parse(ticketExpiresAt) - issuedAt.getTime()).toBe(
      30 * 60 * 1000,
    );
    expect(verifyReviewTicket(reviewTicket, learner, issuedAt)).toMatchObject({
      ownerKey: learner,
      cardKey: knowledgeKey,
      contentVersionId: String(latestId),
      progressVersion: 0,
      schedulerConfigId: schedulerConfig._id,
      scope: topic,
    });
    expect(() =>
      verifyReviewTicket(reviewTicket, learner, new Date(ticketExpiresAt)),
    ).toThrow(expect.objectContaining({ code: 'REVIEW_TICKET_EXPIRED' }));
    expect(() =>
      verifyReviewTicket(`x${reviewTicket}`, learner, issuedAt),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }));
    expect(() =>
      verifyReviewTicket(reviewTicket, otherOwnerKey, issuedAt),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }));
    expect(await db.collection('card_progress').countDocuments()).toBe(0);
    expect(await db.collection('review_logs').countDocuments()).toBe(0);
    expect(await db.collection('operation_receipts').countDocuments()).toBe(
      receiptsBefore,
    );
    expect(await db.collection('scheduler_configs').findOne()).toEqual(
      configBefore,
    );
    expect(await db.collection('statistics').findOne()).toEqual(statsBefore);
  });

  it('requires the permitted deck and drops private cards owned by another account', async () => {
    const ownManual = `manual:${FIXTURE_CONTENT_IDS.cardOwnerA}`;
    const foreignManual = `manual:${FIXTURE_CONTENT_IDS.cardOwnerB}`;
    const personal = { type: 'personalDeck', deckId: String(deckId) };
    await db
      .collection('personal_decks')
      .insertOne({ _id: deckId, ownerKey: learner, status: 'active' });
    await db.collection('deck_entries').insertMany(
      [ownManual, foreignManual].map((cardKey) => ({
        ownerKey: learner,
        deckId,
        cardKey,
      })),
    );
    const body = { scope: personal, mode: 'all' };
    const result = await studyRequest('query', body, account());
    assertSuccessEnvelope(result);
    expect(
      result.body.data.items.map(
        (/** @type {{cardKey: string}} */ item) => item.cardKey,
      ),
    ).toEqual([ownManual]);
    expect((await studyRequest('query', body, account('admin'))).status).toBe(
      404,
    );
    expect(
      (
        await studyRequest(
          'reveal',
          { scope: personal, cardKey: foreignManual },
          account(),
        )
      ).status,
    ).toBe(404);
    await db
      .collection('personal_decks')
      .updateOne({ _id: deckId }, { $set: { status: 'deleting' } });
    expect((await studyRequest('query', body, account())).body.error.code).toBe(
      'RESOURCE_DELETING',
    );
  });

  it('uses each scope’s timestamp and record ID for descending pagination', async () => {
    const cookie = account();
    const knowledge = CONTENT_FIXTURES.knowledgeVersion;
    const older = new Date('2026-10-31T00:00:00.000Z');
    const newer = new Date('2026-11-02T00:00:00.000Z');
    const anotherId = new ObjectId(FIXTURE_CONTENT_IDS.knowledgeB);
    const anotherVersion = new ObjectId();
    const anotherKey = `knowledge:${anotherId}`;
    const manualKey = `manual:${FIXTURE_CONTENT_IDS.cardOwnerA}`;
    const personal = { type: 'personalDeck', deckId: String(deckId) };
    await db.collection('content_items').insertOne({
      ...CONTENT_FIXTURES.knowledge,
      _id: anotherId,
      publishedVersionId: anotherVersion,
      createdAt: older,
    });
    await db.collection('content_versions').insertOne({
      ...knowledge,
      _id: anotherVersion,
      contentId: anotherId,
    });
    await db.collection('content_versions').updateOne(
      { _id: new ObjectId(topic.topicVersionId) },
      {
        $set: {
          'payload.knowledgeVersionIds': [anotherVersion, knowledge._id],
        },
      },
    );
    await db
      .collection('saved_items')
      .updateOne(
        { ownerKey: learner, knowledgeId: knowledge.contentId },
        { $set: { savedAt: older } },
      );
    await db.collection('saved_items').insertOne({
      ownerKey: learner,
      knowledgeId: anotherId,
      isSaved: true,
      savedAt: newer,
    });
    await db.collection('personal_decks').insertOne({
      _id: deckId,
      ownerKey: learner,
      status: 'active',
    });
    await db.collection('deck_entries').insertMany([
      {
        _id: new ObjectId('657f1f77bcf86cd799439051'),
        ownerKey: learner,
        deckId,
        cardKey: manualKey,
        createdAt: newer,
      },
      {
        _id: new ObjectId('657f1f77bcf86cd799439052'),
        ownerKey: learner,
        deckId,
        cardKey: anotherKey,
        createdAt: newer,
      },
    ]);

    for (const [studyScope, firstKey, secondKey] of /** @type {const} */ ([
      [topic, knowledgeKey, anotherKey],
      [{ type: 'saved' }, anotherKey, knowledgeKey],
      [personal, anotherKey, manualKey],
    ])) {
      const body = { scope: studyScope, mode: 'all', limit: 1 };
      const first = await studyRequest('query', body, cookie);
      assertSuccessEnvelope(first);
      expect(first.body.data.items).toMatchObject([{ cardKey: firstKey }]);
      expect(first.body.data.nextCursor).toEqual(expect.any(String));
      const second = await studyRequest(
        'query',
        { ...body, cursor: first.body.data.nextCursor },
        cookie,
      );
      assertSuccessEnvelope(second);
      expect(second.body.data).toMatchObject({
        items: [{ cardKey: secondKey }],
        nextCursor: null,
      });
    }
  });

  it('restricts guest scope to the joined trial, caps the ticket and denies access after the deadline', async () => {
    const trialId = new ObjectId(FIXTURE_PRACTICE_SESSION_ID);
    const cookie = { guestCookie: RAW_GUEST_TOKENS.active };
    const end = new Date(Date.now() - 10 * 60 * 1000);
    const expiresAt = new Date(end.getTime() + 15 * 60 * 1000);
    await db.collection('practice_sessions').insertOne({
      _id: trialId,
      originKind: 'invitation',
      originId: new ObjectId(),
      roomName: 'study-guest-trial',
      deckVersionId: new ObjectId(topic.topicVersionId),
      members: [{ actorKey: learner }, { actorKey: guestKey }],
      endedAt: end,
    });
    await db
      .collection('guest_sessions')
      .updateOne(
        { _id: new ObjectId(FIXTURE_GUEST_IDS.active) },
        { $set: { status: 'summary', expiresAt } },
      );
    const opened = await studyRequest(
      'reveal',
      { scope: topic, cardKey: knowledgeKey },
      cookie,
    );
    assertSuccessEnvelope(opened);
    expect(opened.body.data.ticketExpiresAt).toBe(expiresAt.toISOString());
    const wrong = { type: 'topic', topicVersionId: String(new ObjectId()) };
    expect(
      (await studyRequest('query', { scope: wrong, mode: 'all' }, cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await studyRequest(
          'query',
          { scope: { type: 'saved' }, mode: 'all' },
          cookie,
        )
      ).body.data.items,
    ).toEqual([]);
    await db
      .collection('practice_sessions')
      .updateOne(
        { _id: trialId },
        { $set: { endedAt: new Date(Date.now() - 16 * 60 * 1000) } },
      );
    expect(
      (await studyRequest('query', { scope: topic, mode: 'all' }, cookie)).body
        .error.code,
    ).toBe('GUEST_EXPIRED');
  });

  it('validates request fields and refuses an unrelated hidden revision', async () => {
    const cookie = account();
    expect(
      (
        await studyRequest(
          'query',
          { scope: { ...topic, ownerKey: learner }, mode: 'all' },
          cookie,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await studyRequest(
          'query',
          { scope: topic, mode: 'all', cursor: '' },
          cookie,
        )
      ).body.error.code,
    ).toBe('INVALID_CURSOR');
    await db
      .collection('content_items')
      .updateOne(
        { _id: new ObjectId(FIXTURE_CONTENT_IDS.knowledgeA) },
        { $set: { status: 'hidden' } },
      );
    expect(
      (await studyRequest('query', { scope: topic, mode: 'all' }, cookie)).body
        .data.items,
    ).toEqual([]);
    await db.collection('saved_sources').insertOne({
      ownerKey: learner,
      knowledgeId: new ObjectId(FIXTURE_CONTENT_IDS.knowledgeA),
      knowledgeVersionId: latestId,
    });
    expect(
      (
        await studyRequest(
          'reveal',
          { scope: topic, cardKey: knowledgeKey },
          cookie,
        )
      ).status,
    ).toBe(200);
  });

  it('registers the config once and rejects a corrupt persisted config without granting a ticket', async () => {
    const configs = db.collection('scheduler_configs');
    const before = await configs.findOne();
    await registerScheduler(db);
    expect(await configs.countDocuments()).toBe(1);
    expect(await configs.findOne()).toEqual(before);
    await configs.updateOne({}, { $set: { retention: 0.8 } });
    try {
      const response = await studyRequest(
        'reveal',
        { scope: topic, cardKey: knowledgeKey },
        account(),
      );
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body).not.toHaveProperty('data');
      await expect(registerScheduler(db)).rejects.toThrow(
        'Unsupported FSRS configuration',
      );
    } finally {
      await configs.updateOne(
        {},
        { $set: { retention: schedulerConfig.retention } },
      );
    }
  });
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await db.collection('card_progress').deleteMany({});
  await db.collection('review_logs').deleteMany({});
});

/** @param {string} cardKey @param {string} dueAt @param {string} [owner] */
function seedProgress(cardKey, dueAt, owner = ownerKey) {
  return db.collection('card_progress').insertOne({
    ownerKey: owner,
    cardKey,
    state: 'review',
    dueAt: new Date(dueAt),
    lastReviewAt: new Date('2026-11-12T09:00:00.000Z'),
    stability: 2.3065,
    difficulty: 2.118,
    elapsedDays: 1,
    scheduledDays: 2,
    reps: 3,
    lapses: 0,
    learningSteps: 0,
    schedulerConfigId: schedulerConfig._id,
    version: 3,
  });
}

describe('BE-014 study-card service', () => {
  it('pages over new, due and overdue cards without leaking answers or another owner’s progress', async () => {
    await seedProgress(
      cards[0].cardKey,
      '2026-11-15T10:00:00.000Z',
      otherOwnerKey,
    );
    await seedProgress(cards[1].cardKey, now.toISOString());
    await seedProgress(cards[2].cardKey, '2026-11-13T10:00:00.000Z');
    await seedProgress(cards[3].cardKey, '2026-11-15T10:00:00.000Z');

    const first = await queryStudyCards(db, {
      ...input,
      mode: 'due',
      limit: 2,
    });
    expect(first.items.map((card) => card.cardKey)).toEqual([
      cards[1].cardKey,
      cards[0].cardKey,
    ]);
    expect(first.items[1]).toEqual({
      cardKey: cards[0].cardKey,
      front: cards[0].front,
      contentVersionId: cards[0].contentVersionId,
      progress: {
        cardKey: cards[0].cardKey,
        state: 'new',
        version: 0,
        reps: 0,
        lapses: 0,
      },
    });
    expect(first.items[0].progress).toMatchObject({
      version: 3,
      dueAt: now.toISOString(),
    });
    expect(first.nextCursor).toEqual(expect.any(String));
    const cursor = first.nextCursor ?? undefined;
    expect(
      await queryStudyCards(db, { ...input, mode: 'due', cursor }),
    ).toMatchObject({
      items: [{ cardKey: cards[2].cardKey }],
      nextCursor: null,
    });
    await expect(
      queryStudyCards(db, { ...input, mode: 'all', cursor }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    });
    await expect(
      queryStudyCards(db, {
        ...input,
        scope: { type: 'saved' },
        mode: 'due',
        cursor,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
    const all = await queryStudyCards(db, { ...input, mode: 'all' });
    expect(all.items.map((card) => card.cardKey)).toEqual(
      [cards[1], cards[0], cards[3], cards[2]].map((card) => card.cardKey),
    );
  });

  it('binds the shown revision and shared progress to claims without writing study data (DB-T11)', async () => {
    const reviewed = cards[1];
    await seedProgress(reviewed.cardKey, now.toISOString());
    const storedBefore = await db.collection('card_progress').find().toArray();
    const revised = {
      ...reviewed,
      contentVersionId: '757f1f77bcf86cd799439099',
    };
    const saved = {
      ...input,
      cards: [revised],
      scope: /** @type {const} */ ({ type: 'saved' }),
    };

    const fromTopic = await prepareStudyCardReveal(db, {
      ...input,
      cardKey: reviewed.cardKey,
    });
    const fromSaved = await prepareStudyCardReveal(db, {
      ...saved,
      cardKey: reviewed.cardKey,
    });
    expect(fromSaved.data.progress).toEqual(fromTopic.data.progress);
    expect(fromSaved.data.preview).toEqual(fromTopic.data.preview);
    expect(fromSaved.ticketClaims).toEqual({
      ownerKey,
      cardKey: reviewed.cardKey,
      scope: { type: 'saved' },
      contentVersionId: revised.contentVersionId,
      progressVersion: 3,
      schedulerConfigId: schedulerConfig._id,
      expiresAt: '2026-11-14T10:30:00.000Z',
    });
    expect(fromTopic.data.back).toBe(reviewed.back);
    expect(fromTopic.data.preview.map(({ label }) => label)).toEqual([
      'Again',
      'Hard',
      'Good',
    ]);
    await queryStudyCards(db, { ...input, mode: 'due' });
    const firstReveal = await prepareStudyCardReveal(db, {
      ...input,
      cardKey: cards[0].cardKey,
    });
    expect(firstReveal.ticketClaims.progressVersion).toBe(0);
    expect(await db.collection('card_progress').find().toArray()).toEqual(
      storedBefore,
    );
    expect(await db.collection('review_logs').countDocuments()).toBe(0);
  });

  it('rejects a card outside the resolved set and caps guest claims at the guest deadline', async () => {
    const guest = { ...input, ownerKey: 'guest:657f1f77bcf86cd799439004' };
    const guestExpiresAt = new Date('2026-11-14T10:05:00.000Z');
    const result = await prepareStudyCardReveal(db, {
      ...guest,
      cardKey: cards[0].cardKey,
      guestExpiresAt,
    });
    expect(result.data.ticketExpiresAt).toBe(guestExpiresAt.toISOString());
    expect(result.ticketClaims.expiresAt).toBe(guestExpiresAt.toISOString());
    await expect(
      prepareStudyCardReveal(db, {
        ...guest,
        cardKey: cards[0].cardKey,
        guestExpiresAt: now,
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
    await expect(
      prepareStudyCardReveal(db, {
        ...input,
        cards: [cards[1]],
        cardKey: cards[0].cardKey,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  it('uses the manual card key and version for cards resolved from a personal deck', async () => {
    const manual = {
      cardKey: 'manual:657f1f77bcf86cd799439041',
      front: 'Question',
      back: 'Answer',
      manualVersion: 4,
      position: { time: now.getTime(), id: '657f1f77bcf86cd799439041' },
    };
    const personalDeck = {
      ...input,
      cards: [manual],
      scope: /** @type {const} */ ({
        type: 'personalDeck',
        deckId: '657f1f77bcf86cd799439042',
      }),
    };
    const page = await queryStudyCards(db, { ...personalDeck, mode: 'due' });
    expect(page.items[0]).toMatchObject({
      manualVersion: 4,
      progress: { cardKey: manual.cardKey, state: 'new' },
    });
    expect(page.items[0]).not.toHaveProperty('contentVersionId');
    const reveal = await prepareStudyCardReveal(db, {
      ...personalDeck,
      cardKey: manual.cardKey,
    });
    expect(reveal.ticketClaims).toMatchObject({
      cardKey: manual.cardKey,
      manualVersion: 4,
      scope: personalDeck.scope,
    });
    expect(reveal.ticketClaims).not.toHaveProperty('contentVersionId');
  });
});
