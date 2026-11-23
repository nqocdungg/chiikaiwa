import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { ParticipantInfo, Room, WebhookEvent } from 'livekit-server-sdk';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app.js';
import { notifyMediaSession } from '../../server/integrations/livekit/room-service.js';
import { resolveIdentityFromCookies } from '../../server/modules/identity/identity-service.js';
import { processLivekitWebhook } from '../../server/modules/sessions/livekit-webhook-service.js';
import { changeSessionCards } from '../../server/modules/sessions/session-card-service.js';
import { createSessionPresenceConsumer } from '../../server/modules/sessions/session-lifecycle-service.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  createFixtureJwt,
  DEFAULT_JWT_SECRET,
  FIXTURE_GUEST_IDS,
  FIXTURE_SESSION_IDS,
  FIXTURE_USER_IDS,
  RAW_GUEST_TOKENS,
} from '../fixtures/auth-fixtures.js';
import { CONTENT_FIXTURES } from '../fixtures/content-fixtures.js';
import {
  preparingSession,
  SESSION_ACTORS,
  SESSION_ID,
} from '../fixtures/session-fixtures.js';
import {
  assertErrorEnvelope,
  assertVersionConflict,
  buildCookieHeader,
  createTestIdempotencyKey,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';

vi.mock('../../server/integrations/livekit/room-service.js', () => ({
  listMediaParticipants: vi.fn(async () => {
    throw new Error('Room Service unavailable in fixture');
  }),
  readMediaParticipant: vi.fn(async () => null),
  removeMediaParticipant: vi.fn(async () => {}),
  closeMediaRoom: vi.fn(async () => {}),
  notifyMediaSession: vi.fn(async () => {}),
}));

const { ObjectId } = mongoose.Types;
const origin = 'http://127.0.0.1:5173';
const path = `/api/v1/sessions/${SESSION_ID}`;
const app = createApp();
const knowledge = CONTENT_FIXTURES.knowledgeVersion;
const deckId = new ObjectId();
const deckVersion = new ObjectId();
const oldDeckVersion = new ObjectId();
const secondDeckVersion = new ObjectId();
const hiddenDeckVersion = new ObjectId();
const scenarios = [new ObjectId(), new ObjectId()];
const roles = ['ROLE_A_PRIVATE', 'ROLE_B_PRIVATE'];
const consumer = createSessionPresenceConsumer({ pickController: () => 0 });

/** @type {MongoMemoryReplSet} */ let replicaSet;
/** @type {import('mongoose').mongo.Db} */ let db;
/** @type {Awaited<ReturnType<typeof fetchCsrfContext>>} */ let csrf;
let startedAt = new Date();

/** @typedef {'learnerA'|'learnerB'|'admin'|'guest'} Viewer */
/** @param {Exclude<Viewer, 'guest'>} user */
function account(user) {
  return createFixtureJwt({
    sub: FIXTURE_USER_IDS[user],
    sid: FIXTURE_SESSION_IDS[user],
  });
}

/** @param {'get'|'post'} method @param {string} suffix @param {Viewer} [user] @param {string} [key] */
function api(
  method,
  suffix,
  user = 'learnerA',
  key = createTestIdempotencyKey(),
) {
  const call = request(app)
    [method](path + suffix)
    .set(
      'Cookie',
      buildCookieHeader({
        ...(user === 'guest'
          ? { guestCookie: RAW_GUEST_TOKENS.active }
          : { authCookie: account(user) }),
        csrfCookie: csrf.csrfCookie,
      }),
    );
  if (method === 'post') {
    call
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.csrfToken)
      .set('Idempotency-Key', key);
  }
  return call;
}

/** @param {number} index @param {'participant_joined'|'participant_left'} event @param {Date} at */
function presence(index, event, at) {
  return processLivekitWebhook(
    Object.assign(
      new WebhookEvent({
        id: createTestIdempotencyKey(),
        createdAt: BigInt(Math.floor(at.getTime() / 1000)),
        room: new Room({ name: `session-${SESSION_ID}` }),
        participant: new ParticipantInfo({
          identity: SESSION_ACTORS[index],
          sid: `PA_${index}`,
        }),
      }),
      { event },
    ),
    { now: () => at, onVerifiedPresence: consumer },
  );
}

function sessionDoc() {
  return db.collection('practice_sessions').findOne({ _id: SESSION_ID });
}

/** @param {number} expectedVersion @param {string} [key] */
function select(expectedVersion, key) {
  return api('post', '/deck-selection', 'learnerA', key).send({
    expectedVersion,
    deckVersionId: String(deckVersion),
  });
}

/** @param {number} expectedVersion @param {Date} at @param {string} operationId */
function selectAt(expectedVersion, at, operationId) {
  return changeSessionCards(
    {
      sessionId: String(SESSION_ID),
      operationId,
      now: () => at,
      getIdentity: () =>
        resolveIdentityFromCookies({
          authCookie: account('learnerA'),
          guestCookie: undefined,
          now: at,
        }),
    },
    { kind: 'select', expectedVersion, deckVersionId: String(deckVersion) },
  );
}

/** @param {number} expectedVersion @param {number} slot @param {string} [key] */
function draw(expectedVersion, slot, key) {
  return api('post', '/draws', 'learnerA', key).send({ expectedVersion, slot });
}

/** @param {number} expectedVersion @param {Viewer} user @param {string} [key] */
function claim(expectedVersion, user, key) {
  return api('post', '/control/claim', user, key).send({ expectedVersion });
}

/** @param {any} session @param {string} kind @param {Viewer} [user] */
function propose(session, kind, user) {
  return api('post', '/actions', user).send({
    expectedVersion: session.version,
    cardId: session.currentCard.id,
    kind,
  });
}

/** @param {any} session @param {string} decision @param {Viewer} [user] @param {string} [key] */
function respond(session, decision, user = 'learnerB', key) {
  return api(
    'post',
    `/actions/${session.pendingAction.id}/responses`,
    user,
    key,
  ).send({ expectedVersion: session.version, decision });
}

async function chooseDeck() {
  const version = (await sessionDoc())?.version;
  return (await select(version).expect(200)).body.data;
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_session_cards_test');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  db = await connectDatabase();
  await applyIndexes(db);
  csrf = await fetchCsrfContext(app);
});

beforeEach(async () => {
  await seedContractFixtures(db);
  await Promise.all(
    [
      'session_cards',
      'saved_items',
      'saved_sources',
      'operation_receipts',
      'webhook_receipts',
      'rate_limits',
    ].map((name) => db.collection(name).deleteMany({})),
  );
  startedAt = new Date();
  await db
    .collection('practice_sessions')
    .insertOne(preparingSession(startedAt));
  for (const actorKey of SESSION_ACTORS) {
    await db
      .collection('actor_states')
      .updateOne(/** @type {any} */ ({ _id: actorKey }), {
        $set: { mode: 'inSession', resourceId: String(SESSION_ID) },
      });
  }
  const decks = [
    {
      _id: deckId,
      publishedVersionId: deckVersion,
      status: 'published',
      createdAt: startedAt,
    },
    {
      _id: new ObjectId(),
      publishedVersionId: secondDeckVersion,
      status: 'published',
      createdAt: new Date(startedAt.getTime() - 1000),
    },
    {
      _id: new ObjectId(),
      publishedVersionId: hiddenDeckVersion,
      status: 'hidden',
      createdAt: startedAt,
    },
  ];
  await db
    .collection('content_items')
    .insertMany(decks.map((deck) => ({ ...deck, kind: 'deck' })));
  await db.collection('content_versions').insertMany([
    ...decks.map((deck, index) => ({
      _id: deck.publishedVersionId,
      contentId: deck._id,
      kind: 'deck',
      revision: 2,
      payload: {
        title: `Bộ chủ đề ${index}`,
        level: 'N5',
        description: 'Hội thoại',
        knowledgeVersionIds: [knowledge._id],
        scenarioVersionIds:
          index === 0 ? [...scenarios, scenarios[0]] : [scenarios[0]],
      },
    })),
    {
      _id: oldDeckVersion,
      contentId: deckId,
      kind: 'deck',
      revision: 1,
      payload: { scenarioVersionIds: [scenarios[0]] },
    },
    ...scenarios.map((_id, index) => ({
      _id,
      contentId: new ObjectId(),
      kind: 'scenario',
      revision: 1,
      payload: {
        title: `Tình huống ${index}`,
        context: 'Ở cửa hàng',
        objective: 'Mua một món hàng',
        roleA: roles[0],
        roleB: roles[1],
        hints: ['Chào người bán'],
        knowledgeVersionIds: [knowledge._id],
        questionVersionIds: [new ObjectId()],
      },
    })),
  ]);
  await presence(0, 'participant_joined', startedAt);
  await presence(1, 'participant_joined', startedAt);
  vi.clearAllMocks();
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

it('returns the same published deck counts and scopes the cursor and writes to members', async () => {
  const first = (await api('get', '/deck-options?limit=1').expect(200)).body
    .data;
  const partner = (
    await api('get', '/deck-options?limit=1', 'learnerB').expect(200)
  ).body.data;
  expect(first.items).toEqual([
    {
      id: String(deckId),
      versionId: String(deckVersion),
      title: 'Bộ chủ đề 0',
      level: 'N5',
      description: 'Hội thoại',
      scenarioCount: 2,
    },
  ]);
  expect(partner.items).toEqual(first.items);
  const next =
    '/deck-options?limit=1&cursor=' + encodeURIComponent(first.nextCursor);
  const second = (await api('get', next).expect(200)).body.data;
  expect(second.items[0]).toMatchObject({
    versionId: String(secondDeckVersion),
    scenarioCount: 1,
  });
  expect(second.nextCursor).toBeNull();
  assertErrorEnvelope(await api('get', next, 'learnerB'), {
    expectedStatus: 400,
    expectedCode: 'INVALID_CURSOR',
  });
  await api('get', '/deck-options', 'admin').expect(404);
  const version = (await sessionDoc())?.version;
  await claim(version, 'admin').expect(404);
  for (const revision of [oldDeckVersion, hiddenDeckVersion, scenarios[0]]) {
    assertErrorEnvelope(
      await api('post', '/deck-selection').send({
        expectedVersion: version,
        deckVersionId: String(revision),
      }),
      { expectedStatus: 404, expectedCode: 'RESOURCE_NOT_FOUND' },
    );
  }
  const selected = await chooseDeck();
  expect(selected.deckVersionId).toBe(String(deckVersion));
  expect(selected.slots).toEqual([
    { slot: 0, status: 'faceDown' },
    { slot: 1, status: 'faceDown' },
  ]);
  const persisted = await sessionDoc();
  expect(persisted).not.toHaveProperty('selectionRunningSince');
  const cards = await db
    .collection('session_cards')
    .find({ sessionId: SESSION_ID })
    .toArray();
  expect(cards.map((card) => String(card.scenarioVersionId)).sort()).toEqual(
    scenarios.map(String).sort(),
  );
  await select(selected.version).expect(409);
});

it('keeps the selection deadline on claim, rejects a stale controller and never reclaims on replay', async () => {
  const initial = await sessionDoc();
  const version = initial?.version;
  const key = createTestIdempotencyKey();
  const taken = (await claim(version, 'learnerB', key).expect(200)).body.data;
  expect(taken).toMatchObject({
    controllerKey: SESSION_ACTORS[1],
    version: version + 1,
  });
  const after = await sessionDoc();
  for (const property of [
    'selectionRunningSince',
    'selectionRemainingMs',
    'activeSince',
    'activeDurationMs',
  ]) {
    expect(after?.[property]).toEqual(initial?.[property]);
  }
  assertVersionConflict(await select(version), {
    expectedCurrentVersion: taken.version,
  });
  assertErrorEnvelope(await select(taken.version), {
    expectedStatus: 403,
    expectedCode: 'CONTROL_REQUIRED',
  });
  const returned = (await claim(taken.version, 'learnerA').expect(200)).body
    .data;
  expect(
    (await claim(returned.version, 'learnerA').expect(200)).body.data.version,
  ).toBe(returned.version);
  expect(
    (await claim(version, 'learnerB', key).expect(200)).body.data,
  ).toMatchObject({
    controllerKey: SESSION_ACTORS[0],
    version: returned.version,
  });
  assertErrorEnvelope(await claim(returned.version, 'learnerB', key), {
    expectedStatus: 409,
    expectedCode: 'IDEMPOTENCY_CONFLICT',
  });
  expect(vi.mocked(notifyMediaSession).mock.calls).toEqual([
    [`session-${SESSION_ID}`, String(SESSION_ID), taken.version],
    [`session-${SESSION_ID}`, String(SESSION_ID), returned.version],
  ]);
});

it('commits either claim or selection at a shared version without resetting the selection clock', async () => {
  const initial = await sessionDoc();
  const [claimed, selected] = await Promise.all([
    claim(initial?.version, 'learnerB'),
    select(initial?.version),
  ]);
  expect([claimed.status, selected.status].sort()).toEqual([200, 409]);
  const persisted = await sessionDoc();
  expect(persisted?.version).toBe(initial?.version + 1);
  const cardCount = await db
    .collection('session_cards')
    .countDocuments({ sessionId: SESSION_ID });
  if (claimed.status === 200) {
    assertVersionConflict(selected, {
      expectedCurrentVersion: persisted?.version,
    });
    expect(persisted).toMatchObject({
      controllerKey: SESSION_ACTORS[1],
      selectionRunningSince: initial?.selectionRunningSince,
      selectionRemainingMs: initial?.selectionRemainingMs,
    });
    expect(persisted).not.toHaveProperty('deckVersionId');
    expect(cardCount).toBe(0);
  } else {
    assertVersionConflict(claimed, {
      expectedCurrentVersion: persisted?.version,
    });
    expect(persisted).toMatchObject({
      controllerKey: SESSION_ACTORS[0],
      deckVersionId: deckVersion,
    });
    expect(cardCount).toBe(scenarios.length);
  }
});

it('commits one draw when two slots race and shows each viewer only their assigned role', async () => {
  const selected = await chooseDeck();
  await db
    .collection('content_items')
    .updateOne({ _id: deckId }, { $set: { status: 'hidden' } });
  const keys = [createTestIdempotencyKey(), createTestIdempotencyKey()];
  const results = await Promise.all(
    keys.map((key, slot) => draw(selected.version, slot, key)),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const slot = results.findIndex((result) => result.status === 200);
  const drawn = results[slot].body.data;
  const partner = (await api('get', '', 'learnerB').expect(200)).body.data;
  expect(partner.currentCard).toMatchObject({
    id: drawn.currentCard.id,
    scenarioVersionId: drawn.currentCard.scenarioVersionId,
    title: drawn.currentCard.title,
  });
  expect([drawn.currentCard.myRole, partner.currentCard.myRole].sort()).toEqual(
    roles,
  );
  expect(results[slot].text).not.toContain(partner.currentCard.myRole);
  expect(JSON.stringify(partner)).not.toContain(drawn.currentCard.myRole);
  const cards = await db
    .collection('session_cards')
    .find({ sessionId: SESSION_ID })
    .sort({ slot: 1 })
    .toArray();
  expect(cards[slot]).toMatchObject({
    status: 'current',
    drawnAt: expect.any(Date),
  });
  expect(cards[1 - slot]).not.toHaveProperty('roleAKey');
  expect(results[slot].text).not.toContain(
    String(cards[1 - slot].scenarioVersionId),
  );
  expect(
    (await draw(selected.version, slot, keys[slot]).expect(200)).body.data
      .currentCard,
  ).toEqual(drawn.currentCard);
  expect(notifyMediaSession).toHaveBeenCalledTimes(2);
});

it('allows either claim or draw at a shared version and rejects the losing request', async () => {
  const selected = await chooseDeck();
  const results = await Promise.all([
    claim(selected.version, 'learnerB'),
    draw(selected.version, 0),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const persisted = await sessionDoc();
  expect(persisted?.version).toBe(selected.version + 1);
  if (results[0].status === 200) {
    expect(persisted).not.toHaveProperty('currentCardId');
    assertErrorEnvelope(await draw(persisted?.version, 0), {
      expectedStatus: 403,
      expectedCode: 'CONTROL_REQUIRED',
    });
  } else {
    expect(String(persisted?.currentCardId)).toBe(
      results[1].body.data.currentCard.id,
    );
    expect(persisted?.controllerKey).toBe(SESSION_ACTORS[0]);
  }
});

it('reads drawn hints from the pinned revision and reflects only the viewer’s saved item', async () => {
  const selected = await chooseDeck();
  const hidden = await db
    .collection('session_cards')
    .findOne({ sessionId: SESSION_ID, slot: 0 });
  const hints = `/cards/${hidden?._id}/hints`;
  await api('get', hints).expect(404);
  const current = (await draw(selected.version, 0).expect(200)).body.data
    .currentCard;
  await api('get', hints, 'admin').expect(404);
  await request(app)
    .get(`/api/v1/sessions/${CONTENT_FIXTURES.sessionWithMembers._id}${hints}`)
    .set('Cookie', buildCookieHeader({ authCookie: account('learnerA') }))
    .expect(404);
  await request(app)
    .post('/api/v1/me/saved-items')
    .set(
      'Cookie',
      buildCookieHeader({
        authCookie: account('learnerA'),
        csrfCookie: csrf.csrfCookie,
      }),
    )
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.csrfToken)
    .set('Idempotency-Key', createTestIdempotencyKey())
    .send({
      knowledgeVersionId: String(knowledge._id),
      deckVersionId: String(deckVersion),
      sessionId: String(SESSION_ID),
      scenarioVersionId: current.scenarioVersionId,
    })
    .expect(200);
  const newRevision = {
    ...knowledge,
    _id: new ObjectId(),
    revision: 2,
    payload: { ...knowledge.payload, meaning: 'New meaning' },
  };
  await db.collection('content_versions').insertOne(newRevision);
  await db
    .collection('content_items')
    .updateOne(
      { _id: knowledge.contentId },
      { $set: { publishedVersionId: newRevision._id } },
    );
  const mine = await api('get', hints).expect(200);
  const theirs = (await api('get', hints, 'learnerB').expect(200)).body.data;
  expect(mine.body.data).toEqual({
    hints: ['Chào người bán'],
    knowledge: [
      {
        ...knowledge.payload,
        id: String(knowledge.contentId),
        versionId: String(knowledge._id),
        isSaved: true,
      },
    ],
  });
  expect(theirs.knowledge).toEqual([
    { ...mine.body.data.knowledge[0], isSaved: false },
  ]);
  for (const role of roles) expect(mine.text).not.toContain(role);
  expect((await sessionDoc())?.version).toBe(selected.version + 1);
});

it('applies only the partner response, preserves the rejected card and consumes each slot once', async () => {
  const selected = await chooseDeck();
  const drawKey = createTestIdempotencyKey();
  const drawn = (await draw(selected.version, 0, drawKey).expect(200)).body
    .data;
  const pending = (await propose(drawn, 'skip').expect(201)).body.data.session;
  expect(pending.currentCard).toEqual(drawn.currentCard);
  assertErrorEnvelope(await propose(pending, 'swapRoles', 'learnerB'), {
    expectedStatus: 409,
    expectedCode: 'ACTION_PENDING',
  });
  await respond(pending, 'accept', 'learnerA').expect(403);
  const rejected = (await respond(pending, 'reject').expect(200)).body.data;
  expect(rejected).not.toHaveProperty('pendingAction');
  const afterReject = (await api('get', '').expect(200)).body.data;
  expect(afterReject.currentCard).toEqual(drawn.currentCard);
  const swap = (await propose(rejected, 'swapRoles', 'learnerB').expect(201))
    .body.data.session;
  const responseKey = createTestIdempotencyKey();
  const swapped = (
    await respond(swap, 'accept', 'learnerA', responseKey).expect(200)
  ).body.data;
  expect(swapped.currentCard).toMatchObject({
    id: drawn.currentCard.id,
    myRole: roles.find((role) => role !== drawn.currentCard.myRole),
  });
  expect(
    (await respond(swap, 'accept', 'learnerA', responseKey).expect(200)).body
      .data.version,
  ).toBe(swapped.version);
  expect(
    (await draw(selected.version, 0, drawKey).expect(200)).body.data
      .currentCard,
  ).toEqual(swapped.currentCard);
  const skip = (await propose(swapped, 'skip').expect(201)).body.data.session;
  const skipped = (await respond(skip, 'accept').expect(200)).body.data;
  expect(skipped).not.toHaveProperty('currentCard');
  expect(
    skipped.slots.map((/** @type {{status: string}} */ card) => card.status),
  ).toEqual(['skipped', 'faceDown']);
  assertErrorEnvelope(await draw(skipped.version, 0), {
    expectedStatus: 409,
    expectedCode: 'SLOT_UNAVAILABLE',
  });
  const next = (await draw(skipped.version, 1).expect(200)).body.data;
  await respond({ ...skip, version: next.version }, 'accept').expect(409);
  const complete = (await propose(next, 'completeAndNext').expect(201)).body
    .data.session;
  const exhausted = (await respond(complete, 'accept').expect(200)).body.data;
  expect(exhausted).not.toHaveProperty('currentCard');
  expect(exhausted.status).toBe('active');
  expect(
    exhausted.slots.map((/** @type {{status: string}} */ card) => card.status),
  ).toEqual(['skipped', 'completed']);
  assertErrorEnvelope(await draw(exhausted.version, 0), {
    expectedStatus: 409,
    expectedCode: 'DECK_EXHAUSTED',
  });
});

it('accepts selection one millisecond before the selection cutoff', async () => {
  const version = (await sessionDoc())?.version;
  const at = new Date(startedAt.getTime() + 59_999);
  const result = await selectAt(version, at, createTestIdempotencyKey());
  expect(result.data).toMatchObject({
    status: 'active',
    version: version + 1,
    deckVersionId: String(deckVersion),
    selectionRemainingMs: 1,
    slots: scenarios.map((_, slot) => ({ slot, status: 'faceDown' })),
  });
  expect(await sessionDoc()).not.toHaveProperty('selectionRunningSince');
});

it('closes at the selection cutoff without storing a deck, card or receipt', async () => {
  const version = (await sessionDoc())?.version;
  const cutoff = new Date(startedAt.getTime() + 60_000);
  const operationId = createTestIdempotencyKey();
  await expect(selectAt(version, cutoff, operationId)).rejects.toMatchObject({
    status: 409,
    code: 'SESSION_ENDED',
  });
  const ended = await sessionDoc();
  expect(ended).toMatchObject({
    status: 'ended',
    endedAt: cutoff,
    endReason: 'selection_timeout',
    selectionRemainingMs: 0,
  });
  expect(ended).not.toHaveProperty('deckVersionId');
  expect(
    await db
      .collection('session_cards')
      .countDocuments({ sessionId: SESSION_ID }),
  ).toBe(0);
  expect(
    await db.collection('operation_receipts').countDocuments({ operationId }),
  ).toBe(0);
});

it('refuses deck options in an ended session while preserving the membership check', async () => {
  await api('post', '/leave').send({}).expect(200);
  assertErrorEnvelope(await api('get', '/deck-options'), {
    expectedStatus: 409,
    expectedCode: 'SESSION_ENDED',
  });
  assertErrorEnvelope(await api('get', '/deck-options', 'admin'), {
    expectedStatus: 404,
    expectedCode: 'RESOURCE_NOT_FOUND',
  });
});

it('ends an overdue session when deck options are the first request after the cutoff', async () => {
  const cutoff = new Date(Date.now() - 1_000);
  const since = new Date(cutoff.getTime() - 60_000);
  await db.collection('practice_sessions').updateOne(
    { _id: SESSION_ID },
    {
      $set: {
        startedAt: since,
        activeSince: since,
        selectionRunningSince: since,
      },
    },
  );
  assertErrorEnvelope(await api('get', '/deck-options'), {
    expectedStatus: 409,
    expectedCode: 'SESSION_ENDED',
  });
  expect(await sessionDoc()).toMatchObject({
    status: 'ended',
    endedAt: cutoff,
    endReason: 'selection_timeout',
  });
});

it('cancels pending consent on verified disconnect and blocks card writes while reconnecting', async () => {
  const selected = await chooseDeck();
  const drawn = (await draw(selected.version, 0).expect(200)).body.data;
  const pending = (await propose(drawn, 'swapRoles').expect(201)).body.data
    .session;
  await presence(1, 'participant_left', new Date(startedAt.getTime() + 1000));
  const paused = (await api('get', '').expect(200)).body.data;
  await api('get', '/deck-options').expect(200);
  expect(paused).toMatchObject({
    status: 'reconnecting',
    controllerKey: SESSION_ACTORS[0],
    deckVersionId: String(deckVersion),
    currentCard: drawn.currentCard,
  });
  expect(paused).not.toHaveProperty('pendingAction');
  assertErrorEnvelope(
    await respond({ ...pending, version: paused.version }, 'accept'),
    { expectedStatus: 409, expectedCode: 'SESSION_RECONNECTING' },
  );
  await claim(paused.version, 'learnerB').expect(409);
  await draw(paused.version, 1).expect(409);
});

it('allows the guest trial member to take control and rechecks access before replay', async () => {
  const version = (await sessionDoc())?.version;
  const guestId = new ObjectId(FIXTURE_GUEST_IDS.active);
  const guestKey = `guest:${guestId}`;
  await db
    .collection('guest_sessions')
    .updateOne({ _id: guestId }, { $set: { practiceSessionId: SESSION_ID } });
  await db.collection('practice_sessions').updateOne(
    { _id: SESSION_ID },
    {
      $set: {
        'members.1': { kind: 'guest', actorKey: guestKey },
        'presence.1.actorKey': guestKey,
      },
    },
  );
  await api('get', '/deck-options', 'guest').expect(200);
  const key = createTestIdempotencyKey();
  const claimed = (await claim(version, 'guest', key).expect(200)).body.data;
  expect(claimed.controllerKey).toBe(guestKey);
  const returned = (await claim(claimed.version, 'learnerA').expect(200)).body
    .data;
  const otherSessionId = CONTENT_FIXTURES.sessionWithMembers._id;
  await db
    .collection('guest_sessions')
    .updateOne(
      { _id: guestId },
      { $set: { practiceSessionId: otherSessionId } },
    );
  assertErrorEnvelope(await claim(version, 'guest', key), {
    expectedStatus: 410,
    expectedCode: 'GUEST_EXPIRED',
  });

  await db
    .collection('practice_sessions')
    .updateOne(
      { _id: otherSessionId },
      { $set: { 'members.1': { kind: 'guest', actorKey: guestKey } } },
    );
  assertErrorEnvelope(await claim(version, 'guest', key), {
    expectedStatus: 404,
    expectedCode: 'RESOURCE_NOT_FOUND',
  });
  expect(await sessionDoc()).toMatchObject({
    controllerKey: SESSION_ACTORS[0],
    version: returned.version,
  });
  expect(
    await db
      .collection('operation_receipts')
      .countDocuments({ operationId: key }),
  ).toBe(1);
});
