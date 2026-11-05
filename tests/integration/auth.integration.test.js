import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  hashGuestCredential,
  signJwt,
} from '../../server/modules/identity/crypto.js';

const { ObjectId } = mongoose.Types;
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const app = createApp();

/**
 * Helper to fetch CSRF cookie and token from the Express app.
 */
async function getCsrfContext() {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  const csrfToken = res.body.data.csrfToken;
  const setCookie = res.headers['set-cookie'];
  const csrfCookie = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : String(setCookie ?? '').split(';')[0];
  return { csrfToken, csrfCookie };
}

/**
 * Extracts a specific cookie `name=value` pair from Supertest `set-cookie` headers.
 * @param {string | string[] | undefined} setCookieHeader
 * @param {string} cookieName
 */
function extractCookiePair(setCookieHeader, cookieName) {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const item of list) {
    if (item.startsWith(`${cookieName}=`)) {
      return item.split(';')[0] ?? '';
    }
  }
  return '';
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_auth_integration_test');
  vi.stubEnv('APP_ORIGIN', DEFAULT_ORIGIN);
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('auth_sessions').deleteMany({}),
    db.collection('guest_sessions').deleteMany({}),
    db.collection('actor_states').deleteMany({}),
    db.collection('statistics').deleteMany({}),
    db.collection('rate_limits').deleteMany({}),
    db.collection('saved_items').deleteMany({}),
    db.collection('practice_sessions').deleteMany({}),
  ]);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-001 Authentication replica-set integration tests', () => {
  it('DB-T01: concurrent registration with same normalized email (different casing/whitespace) creates exactly 1 user, 1 actor_state, and increments registeredAccounts by 1', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();

    const payloads = [
      {
        email: '  Hanh.Nhi+Test@Example.COM ',
        password: 'Password123!',
        displayName: 'Hạnh Nhi 1',
      },
      {
        email: 'hanh.nhi+test@example.com',
        password: 'Password456!',
        displayName: 'Hạnh Nhi 2',
      },
      {
        email: 'HANH.NHI+TEST@EXAMPLE.COM',
        password: 'Password789!',
        displayName: 'Hạnh Nhi 3',
      },
    ];

    const responses = await Promise.all(
      payloads.map((payload) =>
        request(app)
          .post('/api/v1/auth/register')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .send(payload),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(2);
    for (const conflict of conflicts) {
      expect(conflict.body.error.code).toBe('EMAIL_EXISTS');
    }

    const createdUser = created[0].body.data.user;
    expect(createdUser.role).toBe('learner');
    expect(createdUser.email.toLowerCase()).toBe('hanh.nhi+test@example.com');
    // Must NOT auto-login on register
    expect(
      extractCookiePair(created[0].headers['set-cookie'], 'ck_session'),
    ).toBe('');

    const userCount = await db
      .collection('users')
      .countDocuments({ emailKey: 'hanh.nhi+test@example.com' });
    const actorCount = await db.collection('actor_states').countDocuments({});
    const actorDoc = await db
      .collection('actor_states')
      .findOne(/** @type {any} */ ({ _id: `user:${createdUser.id}` }));
    const statsDoc = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));

    expect(userCount).toBe(1);
    expect(actorCount).toBe(1);
    expect(actorDoc?.mode).toBe('idle');
    expect(statsDoc?.registeredAccounts).toBe(1);
  });

  it('completes register -> login -> me -> logout lifecycle and rejects revoked or stale authVersion credentials', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();

    // 1. Register
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'learner@example.com',
        password: 'StrongPassword123',
        displayName: 'Minh Anh',
      })
      .expect(201);

    expect(regRes.body.data.user).toMatchObject({
      email: 'learner@example.com',
      displayName: 'Minh Anh',
      role: 'learner',
      version: 0,
    });
    expect(JSON.stringify(regRes.body)).not.toContain('StrongPassword123');
    expect(JSON.stringify(regRes.body)).not.toContain('passwordHash');

    // 2. Wrong password returns 401 INVALID_CREDENTIALS
    const wrongPassRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'learner@example.com',
        password: 'WrongPassword123',
      })
      .expect(401);
    expect(wrongPassRes.body.error.code).toBe('INVALID_CREDENTIALS');

    // 3. Valid login sets HttpOnly cookie with 7-day max expiry and never returns JWT in JSON
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: '  LEARNER@EXAMPLE.COM ',
        password: 'StrongPassword123',
      })
      .expect(200);

    expect(loginRes.body.data.user.id).toBe(regRes.body.data.user.id);
    expect(loginRes.body.data.expiresAt).toBeDefined();
    expect(loginRes.body.data).not.toHaveProperty('token');
    expect(loginRes.body.data).not.toHaveProperty('jwt');

    const sessionCookie = extractCookiePair(
      loginRes.headers['set-cookie'],
      'ck_session',
    );
    expect(sessionCookie).toMatch(/^ck_session=[^;]+$/u);

    const rawSetCookieStr = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : String(loginRes.headers['set-cookie']);
    expect(rawSetCookieStr).toContain('HttpOnly');
    expect(rawSetCookieStr).toContain('SameSite=Lax');
    expect(rawSetCookieStr).toContain('Path=/');
    expect(rawSetCookieStr).not.toContain('Domain=');

    // 4. GET /api/v1/auth/me returns Self DTO
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(meRes.body.data).toEqual({
      kind: 'user',
      user: loginRes.body.data.user,
    });

    // 5. Logout revokes the session and clears the cookie
    const combinedCookies = `${csrfCookie}; ${sessionCookie}`;
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookies)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    // 6. Replaying the revoked session cookie on GET /auth/me is rejected with 401 SESSION_EXPIRED
    const meAfterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);
    expect(meAfterLogout.body.error.code).toBe('SESSION_EXPIRED');

    // 7. Calling logout again with an already revoked cookie still succeeds safely with 204
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookies)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);
  });

  it('rejects old credentials when authVersion is incremented and reports ACCOUNT_LOCKED only after valid password', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'versioned@example.com',
        password: 'ValidPassword123',
        displayName: 'User Version',
      })
      .expect(201);

    const userId = new ObjectId(regRes.body.data.user.id);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'versioned@example.com',
        password: 'ValidPassword123',
      })
      .expect(200);

    const sessionCookie = extractCookiePair(
      loginRes.headers['set-cookie'],
      'ck_session',
    );

    // Increment user.authVersion (simulating password change/reset)
    await db
      .collection('users')
      .updateOne({ _id: userId }, { $inc: { authVersion: 1 } });

    const staleMeRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);
    expect(staleMeRes.body.error.code).toBe('SESSION_EXPIRED');

    // Lock the account
    await db
      .collection('users')
      .updateOne({ _id: userId }, { $set: { status: 'locked' } });

    // Locked account with WRONG password must return 401 INVALID_CREDENTIALS (not 403 ACCOUNT_LOCKED)
    const lockedWrongPw = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'versioned@example.com',
        password: 'WrongPassword999',
      })
      .expect(401);
    expect(lockedWrongPw.body.error.code).toBe('INVALID_CREDENTIALS');

    // Locked account with VALID password returns 403 ACCOUNT_LOCKED
    const lockedValidPw = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'versioned@example.com',
        password: 'ValidPassword123',
      })
      .expect(403);
    expect(lockedValidPw.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('supports guest identity in GET /auth/me, returns 410 GUEST_EXPIRED when expired, and prioritizes user cookie when both exist', async () => {
    const rawGuestToken = 'guest-secret-credential-token-123';
    const credentialHash = hashGuestCredential(rawGuestToken);
    const practiceSessionId = new ObjectId();
    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);

    const guestId = new ObjectId();
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash,
      invitationId: new ObjectId(),
      practiceSessionId,
      status: 'active',
      expiresAt: futureExpiry,
      version: 0,
      cleanupState: 'pending',
    });

    const guestMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(200);

    expect(guestMe.body.data).toEqual({
      kind: 'guest',
      guest: {
        sessionId: practiceSessionId.toHexString(),
        expiresAt: futureExpiry.toISOString(),
        status: 'active',
      },
    });

    // When both valid user cookie and valid guest cookie are present, user identity takes precedence (07 §2.1)
    const { csrfToken, csrfCookie } = await getCsrfContext();
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'both@example.com',
        password: 'ValidPassword123',
        displayName: 'Both User',
      })
      .expect(201);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'both@example.com',
        password: 'ValidPassword123',
      })
      .expect(200);

    const sessionCookie = extractCookiePair(
      loginRes.headers['set-cookie'],
      'ck_session',
    );

    const bothMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${sessionCookie}; ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(bothMe.body.data.kind).toBe('user');
    expect(bothMe.body.data.user.email).toBe('both@example.com');

    // Mark guest session expired -> 410 GUEST_EXPIRED
    await db
      .collection('guest_sessions')
      .updateOne({ _id: guestId }, { $set: { status: 'expired' } });

    const expiredGuestMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(410);
    expect(expiredGuestMe.body.error.code).toBe('GUEST_EXPIRED');
  });

  it('revokes guest credential on logout, rejects replayed guest cookie, handles repeated logout, preserves coexisting user/guest rules, and retains guest_sessions/learning/history records', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();

    const rawGuestToken = 'guest-credential-for-logout-test';
    const credentialHash = hashGuestCredential(rawGuestToken);
    const guestId = new ObjectId();
    const invitationId = new ObjectId();
    const practiceSessionId = new ObjectId();
    const knowledgeId = new ObjectId();
    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash,
      invitationId,
      practiceSessionId,
      status: 'active',
      expiresAt: futureExpiry,
      version: 0,
      cleanupState: 'pending',
    });

    // Seed learning data & practice session history that must NOT be destroyed by logout
    await db.collection('saved_items').insertOne({
      _id: new ObjectId(),
      ownerKey: `guest:${guestId.toHexString()}`,
      knowledgeId,
      isSaved: true,
      savedAt: new Date(),
      version: 0,
    });
    await db.collection('practice_sessions').insertOne({
      _id: practiceSessionId,
      originKind: 'invite',
      originId: invitationId,
      roomName: `room-${practiceSessionId.toHexString()}`,
      status: 'active',
      version: 0,
      members: [
        { actorKey: `guest:${guestId.toHexString()}`, kind: 'guest' },
        {
          actorKey: `user:${new ObjectId().toHexString()}`,
          kind: 'user',
        },
      ],
    });

    // Register & login a user account to test coexisting user + guest cookies on logout
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'coexist@example.com',
        password: 'ValidPassword123',
        displayName: 'Coexist User',
      })
      .expect(201);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'coexist@example.com',
        password: 'ValidPassword123',
      })
      .expect(200);

    const userSessionCookie = extractCookiePair(
      loginRes.headers['set-cookie'],
      'ck_session',
    );

    // 1. When both valid user cookie and valid guest cookie are sent to POST /auth/logout,
    // user is the executing identity (07 §2.1): user session is revoked while guest session stays active
    const userLogoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set(
        'Cookie',
        `${csrfCookie}; ${userSessionCookie}; ck_guest=${rawGuestToken}`,
      )
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    expect(
      extractCookiePair(userLogoutRes.headers['set-cookie'], 'ck_session'),
    ).toBe('ck_session=');
    expect(
      extractCookiePair(userLogoutRes.headers['set-cookie'], 'ck_guest'),
    ).toBe('');

    // User cookie is now revoked
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', userSessionCookie)
      .expect(401);

    // Guest cookie is still active because user was the executing identity in the previous logout
    const guestStillActive = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(guestStillActive.body.data.kind).toBe('guest');

    // 2. Now guest logs out: server must revoke the guest credential
    const guestLogoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', `${csrfCookie}; ck_guest=${rawGuestToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    expect(
      extractCookiePair(guestLogoutRes.headers['set-cookie'], 'ck_guest'),
    ).toBe('ck_guest=');
    expect(
      extractCookiePair(guestLogoutRes.headers['set-cookie'], 'ck_session'),
    ).toBe('');

    // 3. Replaying the old guest cookie to GET /auth/me must be rejected (401 SESSION_EXPIRED)
    const replayGuestRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(replayGuestRes.body.error.code).toBe('SESSION_EXPIRED');

    // 4. Repeated logout with the already-revoked guest cookie succeeds safely with 204
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', `${csrfCookie}; ck_guest=${rawGuestToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    // 5. Root guest_sessions document, saved_items, and practice_sessions remain intact for lifecycle/cleanup
    const guestDocAfter = await db
      .collection('guest_sessions')
      .findOne({ _id: guestId });
    expect(guestDocAfter).not.toBeNull();
    expect(guestDocAfter?.revokedAt).toBeInstanceOf(Date);
    expect(guestDocAfter?.status).toBe('active');
    expect(guestDocAfter?.cleanupState).toBe('pending');
    expect(guestDocAfter?.version).toBe(1);

    const savedCount = await db
      .collection('saved_items')
      .countDocuments({ ownerKey: `guest:${guestId.toHexString()}` });
    const sessionCount = await db
      .collection('practice_sessions')
      .countDocuments({ _id: practiceSessionId });
    expect(savedCount).toBe(1);
    expect(sessionCount).toBe(1);
  });

  it('rejects invalid ck_session without falling back to valid ck_guest on protected routes, clears only ck_session on logout, and never revokes a real session from a forged token', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();
    const authEnvSecret = 'chiikaiwa-dev-only-jwt-secret-key-at-least-32-bytes';

    // 1. Seed a valid guest session
    const rawGuestToken = 'guest-credential-option-b-test';
    const guestId = new ObjectId();
    const practiceSessionId = new ObjectId();
    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: hashGuestCredential(rawGuestToken),
      invitationId: new ObjectId(),
      practiceSessionId,
      status: 'active',
      expiresAt: futureExpiry,
      version: 0,
      cleanupState: 'pending',
    });

    // 2. Register and log in a user account
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'optionb@example.com',
        password: 'ValidPassword123',
        displayName: 'Option B User',
      })
      .expect(201);

    const userId = new ObjectId(regRes.body.data.user.id);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'optionb@example.com',
        password: 'ValidPassword123',
      })
      .expect(200);

    const revokedSessionCookie = extractCookiePair(
      loginRes.headers['set-cookie'],
      'ck_session',
    );
    const firstSessionDoc = await db
      .collection('auth_sessions')
      .findOne({ userId });
    expect(firstSessionDoc).not.toBeNull();

    // Mark the first user session as revoked in the database
    await db
      .collection('auth_sessions')
      .updateOne(
        { _id: firstSessionDoc?._id },
        { $set: { revokedAt: new Date() } },
      );

    // Sequence (a): GET /auth/me with revoked ck_session + valid ck_guest -> 401 SESSION_EXPIRED (no fallback to guest)
    const meWithRevokedSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${revokedSessionCookie}; ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(meWithRevokedSession.body.error.code).toBe('SESSION_EXPIRED');

    // Sequence (b): POST /auth/logout with those exact two cookies + valid CSRF/Origin -> 204;
    // response clears ck_session and does NOT clear ck_guest or revoke guest_sessions
    const logoutWithRevokedSession = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set(
        'Cookie',
        `${csrfCookie}; ${revokedSessionCookie}; ck_guest=${rawGuestToken}`,
      )
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    expect(
      extractCookiePair(
        logoutWithRevokedSession.headers['set-cookie'],
        'ck_session',
      ),
    ).toBe('ck_session=');
    expect(
      extractCookiePair(
        logoutWithRevokedSession.headers['set-cookie'],
        'ck_guest',
      ),
    ).toBe('');

    const guestAfterInvalidUserLogout = await db
      .collection('guest_sessions')
      .findOne({ _id: guestId });
    expect(guestAfterInvalidUserLogout?.revokedAt).toBeUndefined();

    // Sequence (c): GET /auth/me with only the original ck_guest -> 200, kind is 'guest'
    const meWithGuestOnly = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(meWithGuestOnly.body.data.kind).toBe('guest');
    expect(meWithGuestOnly.body.data.guest.sessionId).toBe(
      practiceSessionId.toHexString(),
    );

    // 3. Create a second active user session to test expired token, invalid signature, stale authVersion, locked account, and forged logout
    const secondLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: 'optionb@example.com',
        password: 'ValidPassword123',
      })
      .expect(200);

    const activeSessionCookie = extractCookiePair(
      secondLoginRes.headers['set-cookie'],
      'ck_session',
    );
    const activeSessionDoc = await db
      .collection('auth_sessions')
      .findOne({ userId, revokedAt: { $exists: false } });
    expect(activeSessionDoc).not.toBeNull();
    const activeSessionIdHex = activeSessionDoc?._id.toHexString() ?? '';

    // Expired ck_session + valid ck_guest -> 401 SESSION_EXPIRED (no fallback)
    const pastIat = Math.floor(Date.now() / 1000) - 7200;
    const pastExp = pastIat + 3600;
    const expiredJwt = signJwt(
      {
        sub: userId.toHexString(),
        sid: activeSessionIdHex,
        authVersion: 0,
        iat: pastIat,
        exp: pastExp,
      },
      authEnvSecret,
      { issuer: 'chiikaiwa', audience: 'chiikaiwa-web' },
    );

    const meWithExpiredSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_session=${expiredJwt}; ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(meWithExpiredSession.body.error.code).toBe('SESSION_EXPIRED');

    // Forged ck_session (wrong signature containing real sid & sub of activeSessionDoc) + valid ck_guest:
    // - GET /auth/me -> 401 SESSION_EXPIRED (no fallback)
    // - POST /auth/logout -> 204, clears ck_session, preserves ck_guest, and MUST NOT revoke the real activeSessionDoc!
    const forgedJwt = signJwt(
      {
        sub: userId.toHexString(),
        sid: activeSessionIdHex,
        authVersion: 0,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'forged-wrong-secret-key-with-at-least-32-characters',
      { issuer: 'chiikaiwa', audience: 'chiikaiwa-web' },
    );

    const meWithForgedSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_session=${forgedJwt}; ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(meWithForgedSession.body.error.code).toBe('SESSION_EXPIRED');

    const logoutWithForgedSession = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set(
        'Cookie',
        `${csrfCookie}; ck_session=${forgedJwt}; ck_guest=${rawGuestToken}`,
      )
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    expect(
      extractCookiePair(
        logoutWithForgedSession.headers['set-cookie'],
        'ck_session',
      ),
    ).toBe('ck_session=');
    expect(
      extractCookiePair(
        logoutWithForgedSession.headers['set-cookie'],
        'ck_guest',
      ),
    ).toBe('');

    // Real active session is still unrevoked and works on GET /auth/me
    const realSessionAfterForgedLogout = await db
      .collection('auth_sessions')
      .findOne({ _id: activeSessionDoc?._id });
    expect(realSessionAfterForgedLogout?.revokedAt).toBeUndefined();

    const meWithRealActiveSession = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${activeSessionCookie}; ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(meWithRealActiveSession.body.data.kind).toBe('user');

    // Locked account with authenticated ck_session + valid ck_guest -> 403 ACCOUNT_LOCKED (no fallback)
    await db
      .collection('users')
      .updateOne({ _id: userId }, { $set: { status: 'locked' } });

    const meWithLockedUser = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${activeSessionCookie}; ck_guest=${rawGuestToken}`)
      .expect(403);
    expect(meWithLockedUser.body.error.code).toBe('ACCOUNT_LOCKED');

    // Stale authVersion ck_session + valid ck_guest -> 401 SESSION_EXPIRED (no fallback)
    await db
      .collection('users')
      .updateOne(
        { _id: userId },
        { $set: { status: 'active' }, $inc: { authVersion: 1 } },
      );

    const meWithStaleAuthVersion = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${activeSessionCookie}; ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(meWithStaleAuthVersion.body.error.code).toBe('SESSION_EXPIRED');

    // Guest session remains valid when ck_session is removed
    const meGuestStillValid = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(meGuestStillValid.body.data.kind).toBe('guest');

    // Empty ck_session (`Cookie: ck_session=; ck_guest=<valid>`) must also take the account branch:
    // 1. GET /api/v1/auth/me returns 401 SESSION_EXPIRED
    const meWithEmptyAuthCookie = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_session=; ck_guest=${rawGuestToken}`)
      .expect(401);
    expect(meWithEmptyAuthCookie.body.error.code).toBe('SESSION_EXPIRED');

    // 2. POST /api/v1/auth/logout with valid CSRF/Origin returns 204 and clears only ck_session
    const logoutWithEmptyAuthCookie = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', `${csrfCookie}; ck_session=; ck_guest=${rawGuestToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(204);

    expect(
      extractCookiePair(
        logoutWithEmptyAuthCookie.headers['set-cookie'],
        'ck_session',
      ),
    ).toBe('ck_session=');
    expect(
      extractCookiePair(
        logoutWithEmptyAuthCookie.headers['set-cookie'],
        'ck_guest',
      ),
    ).toBe('');

    const guestAfterEmptyAuthLogout = await db
      .collection('guest_sessions')
      .findOne({ _id: guestId });
    expect(guestAfterEmptyAuthLogout?.revokedAt).toBeUndefined();

    // 3. Sending only ck_guest (omitting ck_session completely) to GET /api/v1/auth/me returns 200 with kind: 'guest'
    const meWithGuestAfterEmptyAuthCleared = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${rawGuestToken}`)
      .expect(200);
    expect(meWithGuestAfterEmptyAuthCleared.body.data.kind).toBe('guest');
  });

  it('enforces IP rate limit even when client spoofs X-Forwarded-For with different emails, and enforces email quota independently behind a configured trusted proxy', async () => {
    const { csrfToken, csrfCookie } = await getCsrfContext();

    // 1. Direct connection spoofing X-Forwarded-For and rotating emails on every attempt
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .send({
          email: `review${i}@example.com`,
          password: 'incorrect-password',
        });
      statuses.push(res.status);
      if (i === 10) {
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      }
    }
    expect(statuses).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429,
    ]);

    // 2. Behind a configured trusted proxy (127.0.0.1), different client IPs have separate IP quotas
    // while targeting the same emailKey still hits the 10-attempt email rate limit
    await db.collection('rate_limits').deleteMany({});
    vi.stubEnv('TRUSTED_PROXY_IPS', '127.0.0.1');

    try {
      for (let i = 0; i < 10; i += 1) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .set('X-Forwarded-For', `198.51.100.${i + 1}, 203.0.113.${i + 1}`)
          .send({
            email: 'targeted-account@example.com',
            password: 'WrongPassword123',
          });
        expect(res.status).toBe(401);
      }

      // 11th attempt against the same email from a brand-new client IP hits the email rate limit
      const emailLimited = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('X-Forwarded-For', '203.0.113.250')
        .send({
          email: 'targeted-account@example.com',
          password: 'WrongPassword123',
        })
        .expect(429);
      expect(emailLimited.body.error.code).toBe('RATE_LIMITED');

      // Meanwhile a different email from that new client IP (203.0.113.250) is NOT blocked by IP quota
      const otherEmailRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('X-Forwarded-For', '203.0.113.250')
        .send({
          email: 'another-account@example.com',
          password: 'WrongPassword123',
        });
      expect(otherEmailRes.status).toBe(401);
    } finally {
      vi.stubEnv('TRUSTED_PROXY_IPS', '');
    }
  });
});
