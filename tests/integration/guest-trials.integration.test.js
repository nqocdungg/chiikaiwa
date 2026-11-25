import { randomUUID } from 'node:crypto';
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
  cancelInvitation,
  getInvitation,
  INVITATION_TTL_MS,
  respondToInviteRequest,
} from '../../server/modules/invitations/invitation-service.js';
import { assertPairCanEnterSession } from '../../server/modules/safety/safety-service.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { ensureLifetimeBaseline } from '../../server/modules/statistics/statistics-repository.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp();
const ORIGIN = 'http://127.0.0.1:5173';
/** @param {string} name @returns {import('mongoose').mongo.Collection<any>} */
function collection(name) {
  return /** @type {any} */ (db.collection(name));
}
/** @param {any} doc */
function idOf(doc) {
  if (!doc?._id) throw new Error('Expected a persisted document');
  return typeof doc._id.toHexString === 'function'
    ? doc._id.toHexString()
    : String(doc._id);
}
const CLEAN_COLLECTIONS = [
  'users',
  'auth_sessions',
  'actor_states',
  'guest_sessions',
  'invitations',
  'invite_requests',
  'operation_receipts',
  'practice_sessions',
  'session_personal',
  'saved_items',
  'rate_limits',
  'blocks',
];

/** @param {unknown} headers @param {string} name */
function extractCookie(headers, name) {
  const list = /** @type {string[] | undefined} */ (
    /** @type {any} */ (headers)?.['set-cookie']
  );
  if (!Array.isArray(list)) throw new Error(`Missing Set-Cookie for ${name}`);
  for (const raw of list) {
    const pair = raw.split(';')[0];
    if (pair.startsWith(`${name}=`)) return pair;
  }
  throw new Error(`Missing cookie ${name}`);
}

async function csrfContext() {
  const response = await request(app).get('/api/v1/auth/csrf').expect(200);
  return {
    token: response.body.data.csrfToken,
    cookie: extractCookie(response.headers, 'ck_csrf'),
  };
}

/** @param {string} [displayName] @param {mongoose.Types.ObjectId} [id] */
async function seedUser(id = new ObjectId(), displayName = 'Host') {
  await collection('users').insertOne({
    _id: id,
    email: `${id.toHexString()}@example.test`,
    emailKey: `${id.toHexString()}@example.test`,
    role: 'learner',
    status: 'active',
    authVersion: 0,
    displayName,
    avatarKey: 'default-1',
    profile: { level: 'N3', interests: [] },
  });
  return id;
}

/**
 * Seeds an open invitation owned by a new active host with its `inviting` reservation.
 * @param {{code?: string, hostId?: mongoose.Types.ObjectId, now?: Date, ttlMs?: number}} [options]
 */
async function seedInvitation({
  code = 'ABCD234567',
  hostId = new ObjectId(),
  now = new Date(),
  ttlMs = INVITATION_TTL_MS,
} = {}) {
  await seedUser(hostId, 'Host');
  const invitation = {
    _id: new ObjectId(),
    hostKey: `user:${hostId.toHexString()}`,
    code,
    status: 'open',
    expiresAt: new Date(now.getTime() + ttlMs),
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
  await collection('invitations').insertOne(invitation);
  await collection('actor_states').insertOne({
    _id: invitation.hostKey,
    mode: 'inviting',
    resourceId: invitation._id.toHexString(),
    version: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { invitation, hostId, hostKey: invitation.hostKey };
}

/**
 * @param {{csrf: {token: string, cookie?: string}, code: string, key?: string, guestCookie?: string, body?: unknown}} input
 */
function postGuestTrial({ csrf, code, key = randomUUID(), guestCookie, body }) {
  const cookies = [csrf.cookie, guestCookie].filter(Boolean).join('; ');
  return request(app)
    .post('/api/v1/guest-trials')
    .set('Origin', ORIGIN)
    .set('X-CSRF-Token', csrf.token)
    .set('Cookie', cookies)
    .set('Idempotency-Key', key)
    .send(body ?? { code });
}

async function counts() {
  const [guests, states, requests, receipts] = await Promise.all([
    collection('guest_sessions').countDocuments(),
    collection('actor_states').countDocuments({
      _id: { $regex: /^guest:/u },
    }),
    collection('invite_requests').countDocuments(),
    collection('operation_receipts').countDocuments(),
  ]);
  return { guests, states, requests, receipts };
}

/** @param {string} sessionId @param {string} guestId */
async function seedGuestPracticeSession(sessionId, guestId) {
  await collection('practice_sessions').insertOne({
    _id: new ObjectId(sessionId),
    originKind: 'invite',
    originId: new ObjectId(),
    roomName: `room-${sessionId}`,
    status: 'preparing',
    version: 0,
    members: [
      { actorKey: `guest:${guestId}`, kind: 'guest' },
      { actorKey: `user:${new ObjectId().toHexString()}`, kind: 'user' },
    ],
    presence: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_guest_trials_test');
  vi.stubEnv('APP_ORIGIN', ORIGIN);
  vi.stubEnv('LIVEKIT_URL', 'wss://media.example.test');
  vi.stubEnv('LIVEKIT_API_KEY', 'test-api-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-api-secret');
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await Promise.all(
    [...CLEAN_COLLECTIONS, 'statistics'].map((name) =>
      db.collection(name).deleteMany({}),
    ),
  );
  await ensureLifetimeBaseline(db);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-015 guest trial identity', () => {
  it('creates one waiting guest with a secure cookie, request and receipt', async () => {
    const { invitation } = await seedInvitation();
    const csrf = await csrfContext();
    const response = await postGuestTrial({ csrf, code: invitation.code })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.request).toMatchObject({
          invitationId: invitation._id.toHexString(),
          requester: { displayName: 'Khách' },
          status: 'pending',
          version: 0,
          expiresAt: invitation.expiresAt.toISOString(),
        });
        expect(body.data.guest).toEqual({ status: 'waiting' });
        expect(body.meta).toMatchObject({
          requestId: expect.any(String),
          serverTime: expect.any(String),
        });
        const serialized = JSON.stringify(body);
        expect(serialized).not.toMatch(/credentialHash|passwordHash/u);
        expect(serialized).not.toContain('ck_guest');
      });

    const guestCookie = extractCookie(response.headers, 'ck_guest');
    expect(guestCookie).toMatch(/^ck_guest=[A-Za-z0-9_-]{43}$/u);
    const raw = /** @type {string[]} */ (
      /** @type {unknown} */ (response.headers['set-cookie'])
    ).find((value) => value.startsWith('ck_guest='));
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Lax');
    expect(raw).toContain('Path=/');
    expect(raw).not.toContain('Max-Age');
    expect(raw).not.toContain('Domain');

    const stored = await counts();
    expect(stored).toEqual({ guests: 1, states: 1, requests: 1, receipts: 1 });
    const guestDoc = await collection('guest_sessions').findOne({});
    expect(guestDoc).toMatchObject({
      invitationId: invitation._id,
      status: 'waiting',
      version: 0,
      cleanupState: 'pending',
    });
    const state = await collection('actor_states').findOne({
      _id: { $regex: /^guest:/u },
    });
    expect(state).toMatchObject({
      mode: 'requestingInvite',
      resourceId: response.body.data.request.id,
    });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(me.body.data).toEqual({
      kind: 'guest',
      guest: { status: 'waiting' },
    });

    // Waiting guests only reach their invitation flow; media credentials are denied.
    const media = await request(app)
      .post(`/api/v1/sessions/${new ObjectId().toHexString()}/media-token`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', `${csrf.cookie}; ${guestCookie}`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(404);
    expect(media.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(media.body.data).toBeUndefined();
  });

  it('returns INVITATION_UNAVAILABLE for wrong, expired, used and cancelled codes without writing', async () => {
    const now = new Date();
    const csrf = await csrfContext();
    const hostId = await seedUser(new ObjectId(), 'Host');
    const invitation = {
      _id: new ObjectId(),
      hostKey: `user:${hostId.toHexString()}`,
      code: 'ABCD234567',
      status: 'open',
      expiresAt: new Date(now.getTime() - 1000),
      version: 1,
      createdAt: new Date(now.getTime() - 20_000),
      updatedAt: now,
    };
    await collection('invitations').insertMany([
      invitation,
      {
        ...invitation,
        _id: new ObjectId(),
        code: 'ABCD234568',
        status: 'used',
      },
      {
        ...invitation,
        _id: new ObjectId(),
        code: 'ABCD234569',
        status: 'cancelled',
      },
    ]);

    for (const code of [
      'ZZZZ234567',
      'ABCD234567',
      'ABCD234568',
      'ABCD234569',
    ]) {
      const response = await postGuestTrial({ csrf, code }).expect(409);
      expect(response.body.error.code).toBe('INVITATION_UNAVAILABLE');
    }
    expect(await counts()).toEqual({
      guests: 0,
      states: 0,
      requests: 0,
      receipts: 0,
    });
  });

  it('rejects malformed bodies and missing keys before writing', async () => {
    const { invitation } = await seedInvitation();
    const csrf = await csrfContext();

    await postGuestTrial({ csrf, code: invitation.code, body: {} })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));
    await postGuestTrial({ csrf, code: invitation.code, body: [] })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('MALFORMED_REQUEST'));
    await postGuestTrial({
      csrf,
      code: invitation.code,
      body: { code: invitation.code, extra: true },
    })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));

    await request(app)
      .post('/api/v1/guest-trials')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', csrf.cookie)
      .send({ code: invitation.code })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));

    await postGuestTrial({
      csrf,
      code: invitation.code,
      key: 'not-a-uuid',
    })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));

    expect(await counts()).toEqual({
      guests: 0,
      states: 0,
      requests: 0,
      receipts: 0,
    });
  });

  it('rate limits invitation-code lookups to 20 per 5 minutes per IP', async () => {
    const csrf = await csrfContext();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await postGuestTrial({
        csrf,
        code: 'ZZZZ234567',
      });
      expect(response.status).toBe(409);
    }
    await postGuestTrial({ csrf, code: 'ZZZZ234567' })
      .expect(429)
      .expect(({ body, headers }) => {
        expect(body.error.code).toBe('RATE_LIMITED');
        expect(Number(headers['retry-after'])).toBeGreaterThan(0);
      });
  });

  it('rejects identity conflicts and unknown or expired guest cookies without writing', async () => {
    const { invitation } = await seedInvitation();
    const csrf = await csrfContext();

    const withSession = await postGuestTrial({
      csrf,
      code: invitation.code,
      guestCookie: 'ck_session=forged-session-cookie',
    }).expect(409);
    expect(withSession.body.error.code).toBe('IDENTITY_CONFLICT');
    expect(withSession.headers['set-cookie']).toBeUndefined();

    const created = await postGuestTrial({
      csrf,
      code: invitation.code,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const before = await counts();

    const both = await postGuestTrial({
      csrf,
      code: invitation.code,
      key: randomUUID(),
      guestCookie: `ck_session=expired-or-forged; ${guestCookie}`,
    }).expect(409);
    expect(both.body.error.code).toBe('IDENTITY_CONFLICT');
    expect(both.headers['set-cookie']).toBeUndefined();

    const unknown = await postGuestTrial({
      csrf,
      code: invitation.code,
      guestCookie: 'ck_guest=unknown-guest-credential',
    })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe('SESSION_EXPIRED'));

    await db
      .collection('guest_sessions')
      .updateOne({}, { $set: { status: 'expired' } });
    const expired = await postGuestTrial({
      csrf,
      code: invitation.code,
      guestCookie,
    })
      .expect(410)
      .expect(({ body }) => expect(body.error.code).toBe('GUEST_EXPIRED'));

    expect(unknown.body.data).toBeUndefined();
    expect(expired.body.data).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('replays the same cookie/key/code and rejects changed code or a new key while waiting', async () => {
    const first = await seedInvitation();
    const second = await seedInvitation({
      code: 'WXYZ234567',
      hostId: new ObjectId(),
    });
    const csrf = await csrfContext();
    const key = randomUUID();
    const created = await postGuestTrial({
      csrf,
      code: first.invitation.code,
      key,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const before = await counts();

    const replayed = await postGuestTrial({
      csrf,
      code: first.invitation.code,
      key,
      guestCookie,
    }).expect(201);
    expect(replayed.body.data.request.id).toBe(created.body.data.request.id);
    expect(await counts()).toEqual(before);

    const conflict = await postGuestTrial({
      csrf,
      code: second.invitation.code,
      key,
      guestCookie,
    }).expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    const busy = await postGuestTrial({
      csrf,
      code: first.invitation.code,
      guestCookie,
    }).expect(409);
    expect(busy.body.error.code).toBe('ACTOR_BUSY');
    expect(await counts()).toEqual(before);
  });

  it('commits only once for concurrent retries with the same cookie and key', async () => {
    const { invitation } = await seedInvitation();
    const csrf = await csrfContext();
    const key = randomUUID();
    const created = await postGuestTrial({
      csrf,
      code: invitation.code,
      key,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const before = await counts();

    const [left, right] = await Promise.all([
      postGuestTrial({
        csrf,
        code: invitation.code,
        key,
        guestCookie,
      }),
      postGuestTrial({
        csrf,
        code: invitation.code,
        key,
        guestCookie,
      }),
    ]);
    expect([left.status, right.status]).toEqual([201, 201]);
    expect(left.body.data.request.id).toBe(right.body.data.request.id);
    expect(left.body.data.request.id).toBe(created.body.data.request.id);
    expect(await counts()).toEqual(before);
  });

  it('lets a waiting guest read its own request but not unrelated invitations', async () => {
    const own = await seedInvitation();
    const other = await seedInvitation({
      code: 'WXYZ234567',
      hostId: new ObjectId(),
    });
    const csrf = await csrfContext();
    const created = await postGuestTrial({
      csrf,
      code: own.invitation.code,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const requestId = created.body.data.request.id;

    const mine = await request(app)
      .get(`/api/v1/invitation-requests/${requestId}`)
      .set('Cookie', guestCookie)
      .expect(200);
    expect(mine.body.data.id).toBe(requestId);

    await request(app)
      .get(`/api/v1/invitations/${other.invitation._id.toHexString()}`)
      .set('Cookie', guestCookie)
      .expect(404);
  });

  it('revokes waiting guest rights on host reject and guest cancel', async () => {
    const csrf = await csrfContext();

    const rejectedHost = await seedInvitation({ code: 'ABCD234567' });
    const rejected = await postGuestTrial({
      csrf,
      code: rejectedHost.invitation.code,
    }).expect(201);
    const rejectedCookie = extractCookie(rejected.headers, 'ck_guest');
    await respondToInviteRequest({
      requestId: rejected.body.data.request.id,
      hostKey: rejectedHost.hostKey,
      expectedVersion: 0,
      decision: 'reject',
      operationId: randomUUID(),
      assertPairCanEnterSession,
    });
    expect(await collection('guest_sessions').findOne({})).toMatchObject({
      status: 'expired',
      cleanupState: 'pending',
    });
    const rejectedMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', rejectedCookie)
      .expect(410);
    expect(rejectedMe.body.error.code).toBe('GUEST_EXPIRED');
    const rejectedState = await collection('actor_states').findOne({
      _id: { $regex: /^guest:/u },
    });
    expect(rejectedState?.mode).toBe('idle');

    await collection('guest_sessions').deleteMany({});
    await collection('actor_states').deleteMany({});
    await collection('invite_requests').deleteMany({});
    await collection('operation_receipts').deleteMany({});

    const cancelledHost = await seedInvitation({
      code: 'WXYZ234567',
      hostId: new ObjectId(),
    });
    const cancelled = await postGuestTrial({
      csrf,
      code: cancelledHost.invitation.code,
    }).expect(201);
    const cancelledCookie = extractCookie(cancelled.headers, 'ck_guest');
    const requestId = cancelled.body.data.request.id;

    await request(app)
      .delete(`/api/v1/invitation-requests/${requestId}?expectedVersion=0`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', `${csrf.cookie}; ${cancelledCookie}`)
      .set('Idempotency-Key', randomUUID())
      .expect(204);

    const cancelledGuest = await collection('guest_sessions').findOne({
      invitationId: cancelledHost.invitation._id,
    });
    expect(cancelledGuest).toMatchObject({ status: 'expired' });
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cancelledCookie)
      .expect(410);
    const invitationAfter = await collection('invitations').findOne({
      _id: cancelledHost.invitation._id,
    });
    expect(invitationAfter?.status).toBe('open');
  });

  it('revokes waiting guests when the invitation is cancelled or expires', async () => {
    const csrf = await csrfContext();

    const cancelledHost = await seedInvitation();
    const cancelled = await postGuestTrial({
      csrf,
      code: cancelledHost.invitation.code,
    }).expect(201);
    await cancelInvitation({
      invitationId: cancelledHost.invitation._id.toHexString(),
      actorKey: cancelledHost.hostKey,
      expectedVersion: 0,
      operationId: randomUUID(),
    });
    expect(await collection('guest_sessions').findOne({})).toMatchObject({
      status: 'expired',
    });
    const cancelledRequest = await collection('invite_requests').findOne({});
    expect(cancelledRequest?.status).toBe('cancelled');
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', extractCookie(cancelled.headers, 'ck_guest'))
      .expect(410);

    await collection('guest_sessions').deleteMany({});
    await collection('actor_states').deleteMany({});
    await collection('invite_requests').deleteMany({});
    await collection('operation_receipts').deleteMany({});

    const expiringHost = await seedInvitation({
      code: 'WXYZ234567',
      hostId: new ObjectId(),
    });
    const expiring = await postGuestTrial({
      csrf,
      code: expiringHost.invitation.code,
    }).expect(201);
    await db
      .collection('invitations')
      .updateOne(
        { _id: expiringHost.invitation._id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    await getInvitation({
      invitationId: expiringHost.invitation._id.toHexString(),
      actorKey: expiringHost.hostKey,
    });
    expect(await collection('guest_sessions').findOne({})).toMatchObject({
      status: 'expired',
    });
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', extractCookie(expiring.headers, 'ck_guest'))
      .expect(410);
  });

  it('accepts the guest into exactly one session and scopes media access', async () => {
    const host = await seedInvitation();
    const csrf = await csrfContext();
    const created = await postGuestTrial({
      csrf,
      code: host.invitation.code,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const requestId = created.body.data.request.id;

    const accepted = await respondToInviteRequest({
      requestId,
      hostKey: host.hostKey,
      expectedVersion: 0,
      decision: 'accept',
      operationId: randomUUID(),
      assertPairCanEnterSession,
    });
    expect(accepted.sessionId).toEqual(expect.any(String));

    const guestDoc = await collection('guest_sessions').findOne({});
    expect(guestDoc).toMatchObject({
      status: 'active',
      practiceSessionId: new ObjectId(accepted.sessionId),
    });
    expect(
      await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(requestId) }),
    ).toMatchObject({
      status: 'accepted',
      practiceSessionId: new ObjectId(accepted.sessionId),
    });
    expect(
      await collection('invitations').findOne({
        _id: host.invitation._id,
      }),
    ).toMatchObject({ status: 'used' });
    for (const actorKey of [host.hostKey, `guest:${idOf(guestDoc)}`]) {
      expect(
        await collection('actor_states').findOne({ _id: actorKey }),
      ).toMatchObject({
        mode: 'inSession',
        resourceId: accepted.sessionId,
      });
    }

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(me.body.data).toEqual({
      kind: 'guest',
      guest: { status: 'active', sessionId: accepted.sessionId },
    });

    await request(app)
      .post(`/api/v1/sessions/${accepted.sessionId}/media-token`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', `${csrf.cookie}; ${guestCookie}`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.token).toEqual(expect.any(String));
        expect(body.data.url).toBe('wss://media.example.test');
      });

    const otherSessionId = new ObjectId().toHexString();
    await seedGuestPracticeSession(otherSessionId, idOf(guestDoc));
    await request(app)
      .post(`/api/v1/sessions/${otherSessionId}/media-token`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', `${csrf.cookie}; ${guestCookie}`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(410)
      .expect(({ body }) => {
        expect(body.error.code).toBe('GUEST_EXPIRED');
      });
    await request(app)
      .get(`/api/v1/sessions/${otherSessionId}`)
      .set('Cookie', guestCookie)
      .expect(404);
  });

  it('expires the losing guest when the host accepts another requester', async () => {
    const host = await seedInvitation();
    const csrf = await csrfContext();
    const first = await postGuestTrial({
      csrf,
      code: host.invitation.code,
    }).expect(201);
    const firstCookie = extractCookie(first.headers, 'ck_guest');
    const second = await postGuestTrial({
      csrf,
      code: host.invitation.code,
    }).expect(201);
    const secondCookie = extractCookie(second.headers, 'ck_guest');

    await respondToInviteRequest({
      requestId: first.body.data.request.id,
      hostKey: host.hostKey,
      expectedVersion: 0,
      decision: 'accept',
      operationId: randomUUID(),
      assertPairCanEnterSession,
    });

    const guests = await collection('guest_sessions').find().toArray();
    expect(guests).toHaveLength(2);
    expect(guests.find((doc) => doc.status === 'active')).toBeDefined();
    expect(guests.find((doc) => doc.status === 'expired')).toBeDefined();
    const secondMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', secondCookie)
      .expect(410);
    expect(secondMe.body.error.code).toBe('GUEST_EXPIRED');
    const loserState = await collection('actor_states').findOne({
      _id: `guest:${idOf(guests.find((doc) => doc.status === 'expired'))}`,
    });
    expect(loserState?.mode).toBe('idle');
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', firstCookie)
      .expect(200);
  });

  it('projects deadlines without renewal and never copies guest data on registration', async () => {
    const host = await seedInvitation();
    const csrf = await csrfContext();
    const created = await postGuestTrial({
      csrf,
      code: host.invitation.code,
    }).expect(201);
    const guestCookie = extractCookie(created.headers, 'ck_guest');
    const guestId = idOf(await collection('guest_sessions').findOne({}));
    const guestKey = `guest:${guestId}`;
    const sessionId = new ObjectId().toHexString();
    await seedGuestPracticeSession(sessionId, guestId);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await collection('guest_sessions').updateOne(
      { _id: new ObjectId(guestId) },
      {
        $set: {
          status: 'summary',
          expiresAt,
          practiceSessionId: new ObjectId(sessionId),
        },
      },
    );

    const summary = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(summary.body.data.guest).toEqual({
      status: 'summary',
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
    const reloaded = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(reloaded.body.data.guest.expiresAt).toBe(expiresAt.toISOString());
    expect(
      (await collection('guest_sessions').findOne({}))?.expiresAt.toISOString(),
    ).toBe(expiresAt.toISOString());

    const knowledgeId = new ObjectId();
    await collection('saved_items').insertOne({
      _id: new ObjectId(),
      ownerKey: guestKey,
      knowledgeId,
      isSaved: true,
      savedAt: new Date(),
      version: 0,
    });
    await collection('session_personal').insertOne({
      ownerKey: guestKey,
      sessionId: new ObjectId(sessionId),
      note: 'Ghi chú riêng của khách',
      noteVersion: 0,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const registered = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', `${csrf.cookie}; ${guestCookie}`)
      .send({
        email: 'guest-owner@example.test',
        password: 'ValidPassword123',
        displayName: 'Guest Owner',
      })
      .expect(201);
    const userKey = `user:${registered.body.data.user.id}`;
    expect(
      await collection('saved_items').countDocuments({ ownerKey: guestKey }),
    ).toBe(1);
    expect(
      await collection('session_personal').countDocuments({
        ownerKey: guestKey,
      }),
    ).toBe(1);
    expect(
      await collection('saved_items').countDocuments({ ownerKey: userKey }),
    ).toBe(0);
    expect(
      await collection('session_personal').countDocuments({
        ownerKey: userKey,
      }),
    ).toBe(0);
    const guestAfter = await collection('guest_sessions').findOne({});
    expect(guestAfter).toMatchObject({
      status: 'summary',
      expiresAt,
      version: 0,
    });
    expect(guestAfter?.revokedAt).toBeUndefined();
    expect(guestAfter?.userId).toBeUndefined();

    await db
      .collection('guest_sessions')
      .updateOne(
        { _id: new ObjectId(guestId) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    const expired = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', guestCookie)
      .expect(410);
    expect(expired.body.error.code).toBe('GUEST_EXPIRED');
  });
});
