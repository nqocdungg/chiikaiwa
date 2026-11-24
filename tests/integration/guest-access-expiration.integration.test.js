import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../server/app.js';
import {
  assertDeckVersionSourceAccess,
  assertKnowledgeSourceAccess,
} from '../../server/modules/content/content-service.js';
import {
  guestAccess,
  TRIAL_GRACE_MS,
} from '../../server/modules/learning/guest-write-guard.js';
import { readStudyReviews } from '../../server/modules/learning/study-review-service.js';
import { resolveStudySet } from '../../server/modules/learning/study-scope.js';
import { createReport } from '../../server/modules/safety/safety-service.js';
import {
  readSessionPersonal,
  readSessionSummary,
} from '../../server/modules/sessions/session-learning-service.js';
import { endSession } from '../../server/modules/sessions/session-lifecycle-service.js';
import { authorizedSession } from '../../server/modules/sessions/session-service.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
import { up as applyIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { up as registerScheduler } from '../../server/persistence/migrations/20261115000100-register-fsrs-six-config.js';
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
  buildCookieHeader,
  createTestIdempotencyKey,
  extractSetCookieValue,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';

const { ObjectId } = mongoose.Types;
const app = createApp();
const origin = 'http://127.0.0.1:5173';
const learnerKey = `user:${FIXTURE_USER_IDS.learnerA}`;
const guestId = new ObjectId(FIXTURE_GUEST_IDS.active);
const guestKey = `guest:${FIXTURE_GUEST_IDS.active}`;
const trialId = new ObjectId(FIXTURE_PRACTICE_SESSION_ID);
const deckItemId = new ObjectId();
const deckVersionId = new ObjectId();
const questionItemId = new ObjectId();
const questionVersionId = new ObjectId();
const knowledgeVersion = CONTENT_FIXTURES.knowledgeVersion;
const knowledgeId = knowledgeVersion.contentId;
const BASE_TIME = new Date('2026-11-22T10:00:00.000Z');
const ENDED_AT = new Date('2026-11-22T10:10:00.000Z');
const DEADLINE = new Date(ENDED_AT.getTime() + TRIAL_GRACE_MS);

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
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_be032_guest_expiration_test');
  vi.stubEnv('APP_ORIGIN', origin);
  db = await connectDatabase();
  await applyIndexes(db);
  await registerScheduler(db);
  csrf = await fetchCsrfContext(app);
});

afterAll(async () => {
  vi.useRealTimers();
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  vi.useRealTimers();
  await seedContractFixtures(db);
  await Promise.all([
    db.collection('practice_sessions').deleteMany({}),
    db.collection('session_personal').deleteMany({}),
    db.collection('saved_items').deleteMany({}),
    db.collection('saved_sources').deleteMany({}),
    db.collection('card_progress').deleteMany({}),
    db.collection('review_logs').deleteMany({}),
    db.collection('quiz_attempts').deleteMany({}),
    db.collection('blocks').deleteMany({}),
    db.collection('reports').deleteMany({}),
    db.collection('operation_receipts').deleteMany({}),
    db.collection('rate_limits').deleteMany({}),
  ]);
  await db.collection('content_items').insertMany([
    {
      _id: deckItemId,
      kind: 'deck',
      status: 'published',
      version: 1,
      publishedVersionId: deckVersionId,
      latestRevision: 1,
      draftPayload: {
        title: 'BE-032 Trial Deck',
        level: 'N4',
        description: 'Deck dùng thử cho kiểm thử hết hạn khách',
        scenarioVersionIds: [],
        knowledgeVersionIds: [knowledgeVersion._id],
        questionVersionIds: [questionVersionId],
      },
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    },
    {
      _id: questionItemId,
      kind: 'question',
      status: 'published',
      version: 1,
      publishedVersionId: questionVersionId,
      latestRevision: 1,
      draftPayload: {
        type: 'multipleChoice',
        prompt: 'Chọn nghĩa đúng của ありがとう',
        options: [
          { id: 'a', text: 'Cảm ơn' },
          { id: 'b', text: 'Xin lỗi' },
        ],
        correctOptionId: 'a',
        explanation: 'ありがとう nghĩa là Cảm ơn.',
        knowledgeVersionIds: [knowledgeVersion._id],
      },
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    },
  ]);
  await db.collection('content_versions').insertMany([
    {
      _id: deckVersionId,
      contentId: deckItemId,
      kind: 'deck',
      revision: 1,
      payload: {
        title: 'BE-032 Trial Deck',
        level: 'N4',
        description: 'Deck dùng thử cho kiểm thử hết hạn khách',
        scenarioVersionIds: [],
        knowledgeVersionIds: [knowledgeVersion._id],
        questionVersionIds: [questionVersionId],
      },
      publishedAt: BASE_TIME,
      publishedBy: new ObjectId(FIXTURE_USER_IDS.admin),
    },
    {
      _id: questionVersionId,
      contentId: questionItemId,
      kind: 'question',
      revision: 1,
      payload: {
        type: 'multipleChoice',
        prompt: 'Chọn nghĩa đúng của ありがとう',
        options: [
          { id: 'a', text: 'Cảm ơn' },
          { id: 'b', text: 'Xin lỗi' },
        ],
        correctOptionId: 'a',
        explanation: 'ありがとう nghĩa là Cảm ơn.',
        knowledgeVersionIds: [knowledgeVersion._id],
      },
      publishedAt: BASE_TIME,
      publishedBy: new ObjectId(FIXTURE_USER_IDS.admin),
    },
  ]);
  await db.collection('practice_sessions').insertOne({
    _id: trialId,
    originKind: 'invitation',
    originId: new ObjectId(),
    roomName: 'be032-trial-room',
    status: 'active',
    version: 1,
    deckVersionId,
    startedAt: BASE_TIME,
    activeDurationMs: 60_000,
    selectionElapsedMs: 10_000,
    members: [
      {
        actorKey: learnerKey,
        kind: 'user',
        userId: new ObjectId(FIXTURE_USER_IDS.learnerA),
      },
      { actorKey: guestKey, kind: 'guest' },
    ],
    presence: [
      { actorKey: learnerKey, connected: true },
      { actorKey: guestKey, connected: true },
    ],
    screenShare: { state: 'idle', version: 0 },
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  });
  await db.collection('guest_sessions').updateOne(
    { _id: guestId },
    {
      $set: {
        status: 'active',
        practiceSessionId: trialId,
        version: 1,
        cleanupState: 'pending',
      },
      $unset: { expiresAt: '', revokedAt: '' },
    },
  );
});

function learnerJwt() {
  const iat = Math.floor(BASE_TIME.getTime() / 1000);
  return createFixtureJwt({
    sub: FIXTURE_USER_IDS.learnerA,
    sid: FIXTURE_SESSION_IDS.learnerA,
    iat,
    exp: iat + 24 * 60 * 60,
  });
}

/** @param {{ guest?: boolean, user?: boolean }} [who] */
function cookieHeader(who = { guest: true }) {
  return buildCookieHeader({
    ...(who.user ? { authCookie: learnerJwt() } : {}),
    ...(who.guest ? { guestCookie: RAW_GUEST_TOKENS.active } : {}),
    csrfCookie: csrf.csrfCookie,
  });
}

/** @param {string} method @param {string} url @param {{ guest?: boolean, user?: boolean, key?: string }} [options] */
function api(method, url, options = { guest: true }) {
  const req = /** @type {any} */ (request(app))
    [method](url)
    .set('Cookie', cookieHeader(options));
  if (method !== 'get') {
    req.set('Origin', origin).set('X-CSRF-Token', csrf.csrfToken);
    if (options.key) req.set('Idempotency-Key', options.key);
  }
  return req;
}

describe('BE-032: Guest access expiration at exact server deadline', () => {
  it('enforces endedAt + 15m boundary across read, write, and idempotency replay while documents still exist, without renewing on reload', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ENDED_AT);

    // 1. End the trial session atomically -> guest moves to summary with expiresAt = endedAt + 15m
    const sessionDoc = await db
      .collection('practice_sessions')
      .findOne({ _id: trialId });
    await withTransaction((session) =>
      endSession(sessionDoc, ENDED_AT, 'left', session),
    );

    const guestAfterEnd = await db
      .collection('guest_sessions')
      .findOne({ _id: guestId });
    expect(guestAfterEnd?.status).toBe('summary');
    expect(guestAfterEnd?.expiresAt?.toISOString()).toBe(
      DEADLINE.toISOString(),
    );

    // 2. Immediately before deadline (endedAt + 15m - 1ms): reads & writes succeed and inherit purgeAt
    vi.setSystemTime(new Date(DEADLINE.getTime() - 1));

    const meBefore = await api('get', '/api/v1/auth/me').expect(200);
    expect(meBefore.body.data.guest).toEqual({
      status: 'summary',
      sessionId: trialId.toHexString(),
      expiresAt: DEADLINE.toISOString(),
    });
    // Reloading /auth/me does not extend expiresAt
    const meReload = await api('get', '/api/v1/auth/me').expect(200);
    expect(meReload.body.data.guest.expiresAt).toBe(DEADLINE.toISOString());

    await api('get', '/api/v1/me/coordination').expect(200);
    await api('get', `/api/v1/sessions/${trialId.toHexString()}`).expect(200);
    await api(
      'get',
      `/api/v1/topic-versions/${deckVersionId.toHexString()}`,
    ).expect(200);
    await api(
      'get',
      `/api/v1/topic-versions/${deckVersionId.toHexString()}/knowledge`,
    ).expect(200);
    await api('get', `/api/v1/knowledge/${knowledgeId.toHexString()}`).expect(
      200,
    );

    const saveKey = createTestIdempotencyKey();
    const savePayload = {
      knowledgeVersionId: knowledgeVersion._id.toHexString(),
      deckVersionId: deckVersionId.toHexString(),
    };
    const savedRes = await api('post', '/api/v1/me/saved-items', {
      guest: true,
      key: saveKey,
    })
      .send(savePayload)
      .expect(200);
    const savedId = savedRes.body.data.id;

    await api('get', '/api/v1/me/saved-items').expect(200);
    await api('get', `/api/v1/me/saved-items/${savedId}/sources`).expect(200);

    await api('post', '/api/v1/study/cards/query')
      .send({
        scope: {
          type: 'topic',
          topicVersionId: deckVersionId.toHexString(),
        },
        mode: 'all',
      })
      .expect(200);
    const revealRes = await api('post', '/api/v1/study/cards/reveal')
      .send({
        scope: {
          type: 'topic',
          topicVersionId: deckVersionId.toHexString(),
        },
        cardKey: `knowledge:${knowledgeId.toHexString()}`,
      })
      .expect(200);
    expect(revealRes.body.data.ticketExpiresAt).toBe(DEADLINE.toISOString());

    const quizCreateKey = createTestIdempotencyKey();
    const quizRes = await api('post', '/api/v1/quizzes', {
      guest: true,
      key: quizCreateKey,
    })
      .send({ deckVersionId: deckVersionId.toHexString() })
      .expect(201);
    const quizId = quizRes.body.data.id;

    const quizSubmitKey = createTestIdempotencyKey();
    const quizSubmitPayload = {
      expectedVersion: 0,
      answers: [
        {
          questionVersionId: questionVersionId.toHexString(),
          optionId: 'a',
        },
      ],
    };
    await api('post', `/api/v1/quizzes/${quizId}/submission`, {
      guest: true,
      key: quizSubmitKey,
    })
      .send(quizSubmitPayload)
      .expect(200);

    await api('get', '/api/v1/me/quizzes').expect(200);
    await api('get', `/api/v1/quizzes/${quizId}`).expect(200);

    const noteKey = createTestIdempotencyKey();
    const notePayload = { expectedVersion: 0, note: 'Ghi chú trước hạn' };
    await api('put', `/api/v1/sessions/${trialId.toHexString()}/note`, {
      guest: true,
      key: noteKey,
    })
      .send(notePayload)
      .expect(200);

    const assessKey = createTestIdempotencyKey();
    const assessPayload = { expectedVersion: 0, confidence: 4, comment: 'Ổn' };
    await api(
      'put',
      `/api/v1/sessions/${trialId.toHexString()}/self-assessment`,
      {
        guest: true,
        key: assessKey,
      },
    )
      .send(assessPayload)
      .expect(200);

    await api(
      'get',
      `/api/v1/sessions/${trialId.toHexString()}/personal`,
    ).expect(200);
    await api(
      'get',
      `/api/v1/sessions/${trialId.toHexString()}/summary`,
    ).expect(200);

    const reviewKey = createTestIdempotencyKey();
    const reviewPayload = {
      reviewTicket: revealRes.body.data.reviewTicket,
      rating: 2,
    };
    await api('post', '/api/v1/study/reviews', {
      guest: true,
      key: reviewKey,
    })
      .send(reviewPayload)
      .expect(201);
    await api(
      'get',
      `/api/v1/me/reviews?cardKey=${encodeURIComponent(`knowledge:${knowledgeId.toHexString()}`)}`,
    ).expect(200);

    // Verify child documents still exist and inherited purgeAt = DEADLINE
    expect(
      (await db.collection('saved_items').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('saved_sources').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('quiz_attempts').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('session_personal').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('card_progress').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('review_logs').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);

    // 3. Exactly at deadline (endedAt + 15m): all endpoints reject 410 GUEST_EXPIRED even though DB docs remain
    vi.setSystemTime(DEADLINE);

    const readChecks = [
      api('get', '/api/v1/auth/me'),
      api('get', '/api/v1/me/coordination'),
      api('get', `/api/v1/sessions/${trialId.toHexString()}`),
      api('get', `/api/v1/sessions/${trialId.toHexString()}/personal`),
      api('get', `/api/v1/sessions/${trialId.toHexString()}/summary`),
      api('get', `/api/v1/topic-versions/${deckVersionId.toHexString()}`),
      api(
        'get',
        `/api/v1/topic-versions/${deckVersionId.toHexString()}/knowledge`,
      ),
      api('get', `/api/v1/knowledge/${knowledgeId.toHexString()}`),
      api('get', '/api/v1/me/saved-items'),
      api('get', `/api/v1/me/saved-items/${savedId}/sources`),
      api('post', '/api/v1/study/cards/query').send({
        scope: {
          type: 'topic',
          topicVersionId: deckVersionId.toHexString(),
        },
        mode: 'all',
      }),
      api('post', '/api/v1/study/cards/reveal').send({
        scope: {
          type: 'topic',
          topicVersionId: deckVersionId.toHexString(),
        },
        cardKey: `knowledge:${knowledgeId.toHexString()}`,
      }),
      api(
        'get',
        `/api/v1/me/reviews?cardKey=${encodeURIComponent(`knowledge:${knowledgeId.toHexString()}`)}`,
      ),
      api('get', '/api/v1/me/blocks'),
      api('get', '/api/v1/me/quizzes'),
      api('get', `/api/v1/quizzes/${quizId}`),
    ];

    for (const check of readChecks) {
      const res = await check;
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('GUEST_EXPIRED');
    }

    // 4. Idempotency replays of previously committed writes are also rejected 410 GUEST_EXPIRED
    const replaySave = await api('post', '/api/v1/me/saved-items', {
      guest: true,
      key: saveKey,
    }).send(savePayload);
    expect(replaySave.status).toBe(410);
    expect(replaySave.body.error.code).toBe('GUEST_EXPIRED');

    const replayQuizCreate = await api('post', '/api/v1/quizzes', {
      guest: true,
      key: quizCreateKey,
    }).send({ deckVersionId: deckVersionId.toHexString() });
    expect(replayQuizCreate.status).toBe(410);
    expect(replayQuizCreate.body.error.code).toBe('GUEST_EXPIRED');

    const replayQuizSubmit = await api(
      'post',
      `/api/v1/quizzes/${quizId}/submission`,
      { guest: true, key: quizSubmitKey },
    ).send(quizSubmitPayload);
    expect(replayQuizSubmit.status).toBe(410);
    expect(replayQuizSubmit.body.error.code).toBe('GUEST_EXPIRED');

    const replayNote = await api(
      'put',
      `/api/v1/sessions/${trialId.toHexString()}/note`,
      { guest: true, key: noteKey },
    ).send(notePayload);
    expect(replayNote.status).toBe(410);
    expect(replayNote.body.error.code).toBe('GUEST_EXPIRED');

    const replayAssess = await api(
      'put',
      `/api/v1/sessions/${trialId.toHexString()}/self-assessment`,
      { guest: true, key: assessKey },
    ).send(assessPayload);
    expect(replayAssess.status).toBe(410);
    expect(replayAssess.body.error.code).toBe('GUEST_EXPIRED');

    const replayReview = await api('post', '/api/v1/study/reviews', {
      guest: true,
      key: reviewKey,
    }).send(reviewPayload);
    expect(replayReview.status).toBe(410);
    expect(replayReview.body.error.code).toBe('GUEST_EXPIRED');

    // Confirm guest documents are still present in MongoDB (access denied independently of physical cleanup)
    expect(
      await db.collection('guest_sessions').countDocuments({ _id: guestId }),
    ).toBe(1);
    expect(
      await db.collection('saved_items').countDocuments({ ownerKey: guestKey }),
    ).toBe(1);
    expect(
      await db
        .collection('quiz_attempts')
        .countDocuments({ ownerKey: guestKey }),
    ).toBe(1);
    expect(
      await db
        .collection('session_personal')
        .countDocuments({ ownerKey: guestKey }),
    ).toBe(1);
    expect(
      await db
        .collection('card_progress')
        .countDocuments({ ownerKey: guestKey }),
    ).toBe(1);
    expect(
      await db.collection('review_logs').countDocuments({ ownerKey: guestKey }),
    ).toBe(1);

    // 5. Logout with expired guest cookie clears safely (204)
    await api('post', '/api/v1/auth/logout').send({}).expect(204);

    // 6. After root guest_sessions deletion, old cookie receives 401 SESSION_EXPIRED
    await db.collection('guest_sessions').deleteOne({ _id: guestId });
    const afterDelete = await api('get', '/api/v1/auth/me');
    expect(afterDelete.status).toBe(401);
    expect(afterDelete.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects 410 GUEST_EXPIRED from practice_sessions.endedAt + 15m even if guest_sessions is still active or trial has no deck', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DEADLINE);

    // Simulate ended practice session whose guest_sessions doc has not yet been updated to summary
    await db.collection('practice_sessions').updateOne(
      { _id: trialId },
      {
        $set: { status: 'ended', endedAt: ENDED_AT },
        $unset: { deckVersionId: '' },
      },
    );

    const meRes = await api('get', '/api/v1/auth/me');
    expect(meRes.status).toBe(410);
    expect(meRes.body.error.code).toBe('GUEST_EXPIRED');

    const guestSession = await db
      .collection('guest_sessions')
      .findOne({ _id: guestId });
    expect(guestSession).toBeTruthy();
    const guestIdentity = {
      kind: /** @type {const} */ ('guest'),
      actorKey: guestKey,
      guestId,
      role: /** @type {const} */ ('guest'),
      guestSession: /** @type {NonNullable<typeof guestSession>} */ (
        guestSession
      ),
    };

    // Direct service-level guards must all throw 410 GUEST_EXPIRED (never 404 or 403 or 200)
    await expect(
      guestAccess(db, guestIdentity, undefined, false, DEADLINE),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      authorizedSession(trialId, guestIdentity, DEADLINE),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      resolveStudySet(
        db,
        guestIdentity,
        { type: 'topic', topicVersionId: deckVersionId.toHexString() },
        DEADLINE,
      ),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    const deckParent = await db
      .collection('content_items')
      .findOne({ _id: deckItemId });
    await expect(
      assertDeckVersionSourceAccess(db, {
        identity: guestIdentity,
        deckVersionId,
        parentItem: /** @type {Record<string, any>} */ (deckParent),
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    const knowledgeParent = await db
      .collection('content_items')
      .findOne({ _id: knowledgeId });
    await expect(
      assertKnowledgeSourceAccess(db, {
        identity: guestIdentity,
        knowledgeId,
        knowledgeVersionId: knowledgeVersion._id,
        parentItem: /** @type {Record<string, any>} */ (knowledgeParent),
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      readSessionPersonal({
        sessionId: trialId.toHexString(),
        identity: guestIdentity,
        now: () => DEADLINE,
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      readSessionSummary({
        sessionId: trialId.toHexString(),
        identity: guestIdentity,
        now: () => DEADLINE,
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      readStudyReviews(guestIdentity, {
        cardKey: `knowledge:${knowledgeId.toHexString()}`,
        limit: 10,
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });

    await expect(
      createReport({
        identity: guestIdentity,
        sessionId: trialId.toHexString(),
        targetActorKey: learnerKey,
        reason: 'spam',
        operationId: createTestIdempotencyKey(),
        now: DEADLINE,
      }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
  });

  it('inherits purgeAt when submitting an active-created quiz, unsaving, or deleting a note during summary, and detects concurrent revocation via CAS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BASE_TIME);

    // 1. Create saved item, quiz attempt, and session note while session is active (no purgeAt yet)
    const saved = await api('post', '/api/v1/me/saved-items', {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({
        knowledgeVersionId: knowledgeVersion._id.toHexString(),
        deckVersionId: deckVersionId.toHexString(),
      })
      .expect(200);
    const quiz = await api('post', '/api/v1/quizzes', {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({ deckVersionId: deckVersionId.toHexString() })
      .expect(201);
    await api('put', `/api/v1/sessions/${trialId.toHexString()}/note`, {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({ expectedVersion: 0, note: 'Ghi chú trong phiên' })
      .expect(200);

    expect(
      (await db.collection('saved_items').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toBeUndefined();
    expect(
      (await db.collection('quiz_attempts').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toBeUndefined();
    expect(
      (await db.collection('session_personal').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toBeUndefined();

    // 2. End session -> summary with expiresAt = DEADLINE
    vi.setSystemTime(ENDED_AT);
    const sessionDoc = await db
      .collection('practice_sessions')
      .findOne({ _id: trialId });
    await withTransaction((session) =>
      endSession(sessionDoc, ENDED_AT, 'left', session),
    );

    const versionBeforeWrites = (
      await db.collection('guest_sessions').findOne({ _id: guestId })
    )?.version;

    // 3. Submit the earlier quiz, unsave the earlier item, and delete the note during summary -> all inherit purgeAt and increment version
    vi.setSystemTime(new Date(ENDED_AT.getTime() + 60_000));
    await api('post', `/api/v1/quizzes/${quiz.body.data.id}/submission`, {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({
        expectedVersion: 0,
        answers: [
          {
            questionVersionId: questionVersionId.toHexString(),
            optionId: 'a',
          },
        ],
      })
      .expect(200);

    await api(
      'delete',
      `/api/v1/me/saved-items/${saved.body.data.id}?expectedVersion=0`,
      {
        guest: true,
        key: createTestIdempotencyKey(),
      },
    ).expect(204);

    await api(
      'delete',
      `/api/v1/sessions/${trialId.toHexString()}/note?expectedVersion=1`,
      {
        guest: true,
        key: createTestIdempotencyKey(),
      },
    ).expect(204);

    expect(
      (await db.collection('quiz_attempts').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('saved_items').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('session_personal').findOne({ ownerKey: guestKey }))
        ?.purgeAt,
    ).toEqual(DEADLINE);
    expect(
      (await db.collection('guest_sessions').findOne({ _id: guestId }))
        ?.version,
    ).toBe(versionBeforeWrites + 3);

    // 4. Revoked guest mid-flight rejected with 410 GUEST_EXPIRED by authorizedSession & guestAccess
    await db.collection('guest_sessions').updateOne(
      { _id: guestId },
      {
        $set: { revokedAt: new Date(ENDED_AT.getTime() + 65_000) },
        $inc: { version: 1 },
      },
    );

    const guestIdentity = {
      kind: /** @type {const} */ ('guest'),
      actorKey: guestKey,
      guestId,
      role: /** @type {const} */ ('guest'),
    };
    await expect(
      authorizedSession(
        trialId,
        /** @type {any} */ (guestIdentity),
        new Date(ENDED_AT.getTime() + 70_000),
      ),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
    await expect(
      withTransaction((session) =>
        guestAccess(
          db,
          guestIdentity,
          session,
          true,
          new Date(ENDED_AT.getTime() + 70_000),
        ),
      ),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
  });

  it('preserves account partner session history and private data after guest expires, and prioritizes valid account cookie over expired guest cookie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BASE_TIME);

    // Partner learner saves an item and creates a quiz
    const learnerSave = await api('post', '/api/v1/me/saved-items', {
      user: true,
      key: createTestIdempotencyKey(),
    })
      .send({
        knowledgeVersionId: knowledgeVersion._id.toHexString(),
        deckVersionId: deckVersionId.toHexString(),
      })
      .expect(200);
    const learnerQuiz = await api('post', '/api/v1/quizzes', {
      user: true,
      key: createTestIdempotencyKey(),
    })
      .send({ deckVersionId: deckVersionId.toHexString() })
      .expect(201);

    // End session and advance past guest deadline
    vi.setSystemTime(ENDED_AT);
    const sessionDoc = await db
      .collection('practice_sessions')
      .findOne({ _id: trialId });
    await withTransaction((session) =>
      endSession(sessionDoc, ENDED_AT, 'left', session),
    );
    vi.setSystemTime(new Date(DEADLINE.getTime() + 60_000));

    // Guest is expired
    const guestMe = await api('get', '/api/v1/auth/me', { guest: true });
    expect(guestMe.status).toBe(410);
    expect(guestMe.body.error.code).toBe('GUEST_EXPIRED');

    // Account partner still accesses session (with partner labeled 'Khách'), saved items, and quizzes
    // even when both ck_session and expired ck_guest cookies are sent together
    const partnerSession = await api(
      'get',
      `/api/v1/sessions/${trialId.toHexString()}`,
      { user: true, guest: true },
    ).expect(200);
    expect(partnerSession.body.data.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorKey: guestKey, displayName: 'Khách' }),
      ]),
    );

    const partnerSaved = await api('get', '/api/v1/me/saved-items', {
      user: true,
      guest: true,
    }).expect(200);
    expect(partnerSaved.body.data.items).toHaveLength(1);
    expect(partnerSaved.body.data.items[0].id).toBe(learnerSave.body.data.id);

    const partnerQuiz = await api(
      'get',
      `/api/v1/quizzes/${learnerQuiz.body.data.id}`,
      { user: true, guest: true },
    ).expect(200);
    expect(partnerQuiz.body.data.id).toBe(learnerQuiz.body.data.id);

    // Learner records have no purgeAt
    expect(
      (await db.collection('saved_items').findOne({ ownerKey: learnerKey }))
        ?.purgeAt,
    ).toBeUndefined();
    expect(
      (await db.collection('quiz_attempts').findOne({ ownerKey: learnerKey }))
        ?.purgeAt,
    ).toBeUndefined();
  });

  it('does not transfer guest ownership when registering a new account while holding ck_guest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ENDED_AT);

    const sessionDoc = await db
      .collection('practice_sessions')
      .findOne({ _id: trialId });
    await withTransaction((session) =>
      endSession(sessionDoc, ENDED_AT, 'left', session),
    );

    vi.setSystemTime(new Date(ENDED_AT.getTime() + 60_000));

    await api('post', '/api/v1/me/saved-items', {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({
        knowledgeVersionId: knowledgeVersion._id.toHexString(),
        deckVersionId: deckVersionId.toHexString(),
      })
      .expect(200);

    const revealRes = await api('post', '/api/v1/study/cards/reveal')
      .send({
        scope: {
          type: 'topic',
          topicVersionId: deckVersionId.toHexString(),
        },
        cardKey: `knowledge:${knowledgeId.toHexString()}`,
      })
      .expect(200);

    await api('post', '/api/v1/study/reviews', {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({
        reviewTicket: revealRes.body.data.reviewTicket,
        rating: 2,
      })
      .expect(201);

    await api('post', '/api/v1/quizzes', {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({ deckVersionId: deckVersionId.toHexString() })
      .expect(201);

    await api('put', `/api/v1/sessions/${trialId.toHexString()}/note`, {
      guest: true,
      key: createTestIdempotencyKey(),
    })
      .send({ expectedVersion: 0, note: 'Ghi chú tạm của khách' })
      .expect(200);

    const regRes = await api('post', '/api/v1/auth/register', { guest: true })
      .send({
        email: 'be032-new-user@example.test',
        password: 'ValidPassword123',
        displayName: 'New Learner',
      })
      .expect(201);
    const newUserKey = `user:${regRes.body.data.user.id}`;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Cookie', csrf.csrfCookie)
      .set('X-CSRF-Token', csrf.csrfToken)
      .send({
        email: 'be032-new-user@example.test',
        password: 'ValidPassword123',
      })
      .expect(200);
    const sessionToken = extractSetCookieValue(
      loginRes.headers['set-cookie'],
      'ck_session',
    );
    expect(sessionToken).toBeTruthy();
    const sessionCookie = `ck_session=${sessionToken}`;

    const userSaved = await request(app)
      .get('/api/v1/me/saved-items')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(userSaved.body.data.items).toEqual([]);

    const userQuizzes = await request(app)
      .get('/api/v1/me/quizzes')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(userQuizzes.body.data.items).toEqual([]);

    const userReviews = await request(app)
      .get(
        `/api/v1/me/reviews?cardKey=${encodeURIComponent(`knowledge:${knowledgeId.toHexString()}`)}`,
      )
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(userReviews.body.data.items).toEqual([]);

    const userSessions = await request(app)
      .get('/api/v1/me/sessions')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(userSessions.body.data.items).toEqual([]);

    for (const col of [
      'saved_items',
      'saved_sources',
      'quiz_attempts',
      'session_personal',
      'card_progress',
      'review_logs',
    ]) {
      expect(
        await db.collection(col).countDocuments({ ownerKey: guestKey }),
      ).toBe(1);
      expect(
        await db.collection(col).countDocuments({ ownerKey: newUserKey }),
      ).toBe(0);
    }
  });
});
