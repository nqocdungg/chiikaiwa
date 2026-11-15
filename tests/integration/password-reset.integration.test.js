import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
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
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import * as identityCrypto from '../../server/modules/identity/crypto.js';
import {
  generatePasswordResetToken,
  hashGuestCredential,
  hashPasswordResetToken,
} from '../../server/modules/identity/crypto.js';
import {
  changeUserPassword,
  NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE,
  requestPasswordReset,
  resetPasswordWithToken,
} from '../../server/modules/identity/identity-service.js';

const { ObjectId } = mongoose.Types;
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;

/**
 * Captured email dispatches during tests.
 * @type {Array<{ toEmail: string, displayName?: string, resetToken: string }>}
 */
let sentEmails = [];

/**
 * Optional failure hook for the email sender in tests.
 * @type {(() => Promise<void>) | null}
 */
let emailSenderFailureHook = null;

/**
 * Background tasks registered via waitUntil during HTTP requests.
 * @type {Array<Promise<unknown>>}
 */
let pendingBackgroundTasks = [];

/**
 * Awaits and clears all background tasks registered via waitUntil.
 */
async function flushBackgroundTasks() {
  while (pendingBackgroundTasks.length > 0) {
    const batch = pendingBackgroundTasks.splice(
      0,
      pendingBackgroundTasks.length,
    );
    await Promise.allSettled(batch);
  }
}

const app = createApp({
  sendPasswordResetEmail: async (payload) => {
    if (emailSenderFailureHook) {
      await emailSenderFailureHook();
    }
    sentEmails.push(payload);
    return { messageId: `<test-${sentEmails.length}@chiikaiwa.local>` };
  },
  waitUntil: (promise) => {
    pendingBackgroundTasks.push(Promise.resolve(promise));
  },
});

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

/**
 * Helper to register and login a learner account, returning user info and session cookie.
 * @param {{ email?: string, password?: string, displayName?: string }} [overrides]
 */
async function registerAndLoginLearner({
  email = 'hanh.nhi@example.com',
  password = 'InitialPassword123!',
  displayName = 'Hạnh Nhi',
} = {}) {
  const { csrfToken, csrfCookie } = await getCsrfContext();

  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', DEFAULT_ORIGIN)
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ email, password, displayName })
    .expect(201);

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', DEFAULT_ORIGIN)
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ email, password })
    .expect(200);

  const sessionCookie = extractCookiePair(
    loginRes.headers['set-cookie'],
    'ck_session',
  );

  return {
    user: regRes.body.data.user,
    sessionCookie,
    csrfToken,
    csrfCookie,
  };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_password_reset_integration_test');
  vi.stubEnv('APP_ORIGIN', DEFAULT_ORIGIN);
  vi.stubEnv('BREVO_API_KEY', 'xkeysib-test-integration-key');
  vi.stubEnv('BREVO_SENDER_EMAIL', 'no-reply@chiikaiwa.example.com');
  vi.stubEnv('BREVO_SENDER_NAME', 'Chiikaiwa');
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await flushBackgroundTasks();
  sentEmails = [];
  emailSenderFailureHook = null;
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('auth_sessions').deleteMany({}),
    db.collection('guest_sessions').deleteMany({}),
    db.collection('password_reset_tokens').deleteMany({}),
    db.collection('actor_states').deleteMany({}),
    db.collection('statistics').deleteMany({}),
    db.collection('rate_limits').deleteMany({}),
  ]);
});

afterEach(async () => {
  await flushBackgroundTasks();
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-007 Password change & Brevo password reset replica-set integration tests', () => {
  describe('POST /api/v1/auth/password-change (U)', () => {
    it('changes password when currentPassword is correct, increments authVersion/version, revokes all active sessions, and invalidates unused reset tokens', async () => {
      const { user, sessionCookie, csrfToken, csrfCookie } =
        await registerAndLoginLearner();

      // Create a second active session (e.g. another browser/tab)
      const secondLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'hanh.nhi@example.com',
          password: 'InitialPassword123!',
        })
        .expect(200);
      const secondSessionCookie = extractCookiePair(
        secondLogin.headers['set-cookie'],
        'ck_session',
      );

      // Also request a password reset token before changing password to verify it gets invalidated
      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'hanh.nhi@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      expect(sentEmails).toHaveLength(1);
      const pendingResetToken = sentEmails[0].resetToken;

      // Change password with valid currentPassword
      await request(app)
        .post('/api/v1/auth/password-change')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', `${csrfCookie}; ${sessionCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'InitialPassword123!',
          newPassword: 'UpdatedPassword456!',
        })
        .expect(204);

      // Verify user authVersion and version incremented
      const updatedUserDoc = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });
      expect(updatedUserDoc?.authVersion).toBe(1);
      expect(updatedUserDoc?.version).toBeGreaterThanOrEqual(2);

      // Both previous sessions must now be rejected with 401 SESSION_EXPIRED on protected endpoints
      const meFirst = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);
      expect(meFirst.body.error.code).toBe('SESSION_EXPIRED');

      const meSecond = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', secondSessionCookie)
        .expect(401);
      expect(meSecond.body.error.code).toBe('SESSION_EXPIRED');

      // Pending reset token issued before the password change must be invalidated
      const resetAttempt = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: pendingResetToken,
          newPassword: 'AnotherPassword789!',
        })
        .expect(400);
      expect(resetAttempt.body.error.code).toBe('RESET_TOKEN_INVALID');

      // Old password can no longer login
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'hanh.nhi@example.com',
          password: 'InitialPassword123!',
        })
        .expect(401);
      expect(oldLogin.body.error.code).toBe('INVALID_CREDENTIALS');

      // New password logs in and accesses protected endpoints
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'hanh.nhi@example.com',
          password: 'UpdatedPassword456!',
        })
        .expect(200);
      const newSessionCookie = extractCookiePair(
        newLogin.headers['set-cookie'],
        'ck_session',
      );
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', newSessionCookie)
        .expect(200);
    });

    it('rejects wrong currentPassword with 401 INVALID_CREDENTIALS and invalid newPassword with 422 VALIDATION_FAILED without revoking current session', async () => {
      const { sessionCookie, csrfToken, csrfCookie } =
        await registerAndLoginLearner();

      const wrongCurrent = await request(app)
        .post('/api/v1/auth/password-change')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', `${csrfCookie}; ${sessionCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'WrongCurrentPassword!',
          newPassword: 'UpdatedPassword456!',
        })
        .expect(401);
      expect(wrongCurrent.body.error.code).toBe('INVALID_CREDENTIALS');

      const invalidNew = await request(app)
        .post('/api/v1/auth/password-change')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', `${csrfCookie}; ${sessionCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'InitialPassword123!',
          newPassword: 'short',
        })
        .expect(422);
      expect(invalidNew.body.error.code).toBe('VALIDATION_FAILED');

      // Session remains active
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);
    });

    it('rejects guest callers (G) on POST /api/v1/auth/password-change with 403 FORBIDDEN', async () => {
      const { csrfToken, csrfCookie } = await getCsrfContext();
      const rawGuestToken = 'guest-secret-credential-for-password-change-test';
      const now = new Date();
      await db.collection('guest_sessions').insertOne({
        _id: new ObjectId(),
        credentialHash: hashGuestCredential(rawGuestToken),
        status: 'waiting',
        version: 0,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        purgeAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(app)
        .post('/api/v1/auth/password-change')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', `${csrfCookie}; ck_guest=${rawGuestToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'InitialPassword123!',
          newPassword: 'UpdatedPassword456!',
        })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/auth/password-reset-requests (P)', () => {
    it('returns identical neutral 202 response for existing active email, nonexistent email, and locked account without leaking account status', async () => {
      const { user, csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'active.user@example.com',
      });

      const lockedUser = await registerAndLoginLearner({
        email: 'locked.user@example.com',
      });
      await db
        .collection('users')
        .updateOne(
          { _id: new ObjectId(lockedUser.user.id) },
          { $set: { status: 'locked' } },
        );

      // 1. Existing active user
      const activeRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: '  ACTIVE.USER@EXAMPLE.COM ' })
        .expect(202);

      // 2. Non-existent email
      const missingRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'nobody@example.com' })
        .expect(202);

      // 3. Locked account
      const lockedRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'locked.user@example.com' })
        .expect(202);

      expect(activeRes.body.data).toEqual({
        message: NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE,
      });
      expect(missingRes.body.data).toEqual(activeRes.body.data);
      expect(lockedRes.body.data).toEqual(activeRes.body.data);

      await flushBackgroundTasks();

      // Only the active user should have a token created and an email sent
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].toEmail).toBe('active.user@example.com');
      const rawToken = sentEmails[0].resetToken;

      const storedTokens = await db
        .collection('password_reset_tokens')
        .find({})
        .toArray();
      expect(storedTokens).toHaveLength(1);
      expect(storedTokens[0].userId.toHexString()).toBe(user.id);
      // Database must store SHA-256 tokenHash and NEVER store raw token
      expect(storedTokens[0].tokenHash).toBe(hashPasswordResetToken(rawToken));
      expect(JSON.stringify(storedTokens[0])).not.toContain(rawToken);
      expect(storedTokens[0].expiresAt).toBeInstanceOf(Date);
      expect(storedTokens[0].purgeAt).toEqual(storedTokens[0].expiresAt);
    });

    it('returns identical neutral 202 response for active, nonexistent, and locked emails when Brevo fails or times out, keeping password intact and invalidating the undelivered token', async () => {
      const { user, csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'brevo.fail@example.com',
        password: 'OriginalPassword123!',
      });
      const lockedUser = await registerAndLoginLearner({
        email: 'brevo.fail.locked@example.com',
      });
      await db
        .collection('users')
        .updateOne(
          { _id: new ObjectId(lockedUser.user.id) },
          { $set: { status: 'locked' } },
        );

      const userBefore = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });

      emailSenderFailureHook = async () => {
        throw new Error('Brevo upstream timeout');
      };

      const activeRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'brevo.fail@example.com' })
        .expect(202);

      const missingRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'nobody.brevo.fail@example.com' })
        .expect(202);

      const lockedRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'brevo.fail.locked@example.com' })
        .expect(202);

      // All three email groups receive the exact same HTTP status and public payload (excluding per-request meta)
      expect(activeRes.body.data).toEqual({
        message: NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE,
      });
      expect(missingRes.body.data).toEqual(activeRes.body.data);
      expect(lockedRes.body.data).toEqual(activeRes.body.data);

      await flushBackgroundTasks();

      // User's passwordHash and authVersion must not have changed
      const userAfter = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });
      expect(userAfter?.passwordHash).toBe(userBefore?.passwordHash);
      expect(userAfter?.authVersion).toBe(userBefore?.authVersion);

      // Any token created before the email failure must be marked invalidatedAt
      const tokens = await db
        .collection('password_reset_tokens')
        .find({ userId: new ObjectId(user.id) })
        .toArray();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].invalidatedAt).toBeInstanceOf(Date);

      // User can still login with their original password
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'brevo.fail@example.com',
          password: 'OriginalPassword123!',
        })
        .expect(200);
    });

    it('returns identical 503 SERVICE_UNAVAILABLE for active, nonexistent, and locked emails when Brevo configuration is globally unavailable', async () => {
      await registerAndLoginLearner({
        email: 'brevo.unconfigured.active@example.com',
      });
      const lockedUser = await registerAndLoginLearner({
        email: 'brevo.unconfigured.locked@example.com',
      });
      await db
        .collection('users')
        .updateOne(
          { _id: new ObjectId(lockedUser.user.id) },
          { $set: { status: 'locked' } },
        );

      const unconfiguredApp = createApp({ checkHealth: async () => {} });
      const csrfRes = await request(unconfiguredApp)
        .get('/api/v1/auth/csrf')
        .expect(200);
      const unconfiguredCsrfToken = csrfRes.body.data.csrfToken;
      const unconfiguredCsrfCookie = extractCookiePair(
        csrfRes.headers['set-cookie'],
        'ck_csrf',
      );

      vi.stubEnv('BREVO_API_KEY', '');
      try {
        const activeRes = await request(unconfiguredApp)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', unconfiguredCsrfCookie)
          .set('X-CSRF-Token', unconfiguredCsrfToken)
          .send({ email: 'brevo.unconfigured.active@example.com' })
          .expect(503);

        const missingRes = await request(unconfiguredApp)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', unconfiguredCsrfCookie)
          .set('X-CSRF-Token', unconfiguredCsrfToken)
          .send({ email: 'nobody.unconfigured@example.com' })
          .expect(503);

        const lockedRes = await request(unconfiguredApp)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', unconfiguredCsrfCookie)
          .set('X-CSRF-Token', unconfiguredCsrfToken)
          .send({ email: 'brevo.unconfigured.locked@example.com' })
          .expect(503);

        expect(activeRes.body.error).toEqual({
          code: 'SERVICE_UNAVAILABLE',
          message: expect.any(String),
        });
        expect(missingRes.body.error).toEqual(activeRes.body.error);
        expect(lockedRes.body.error).toEqual(activeRes.body.error);
      } finally {
        vi.stubEnv('BREVO_API_KEY', 'xkeysib-test-integration-key');
      }
    });

    it('preserves an existing valid reset link A when resending link B fails due to Brevo timeout, then allows A to reset once', async () => {
      const { csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'preserve.link@example.com',
        password: 'OldPassword123!',
      });

      // 1. Send link A successfully
      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'preserve.link@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      expect(sentEmails).toHaveLength(1);
      const tokenA = sentEmails[0].resetToken;

      // 2. Simulate Brevo timeout when sending link B for the same account
      emailSenderFailureHook = async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError');
      };

      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'preserve.link@example.com' })
        .expect(202);
      await flushBackgroundTasks();

      // 3. Use link A to reset password: first attempt returns 204, reuse returns 400 RESET_TOKEN_INVALID
      await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: tokenA,
          newPassword: 'RecoveredPassword123!',
        })
        .expect(204);

      const reuseRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: tokenA,
          newPassword: 'AnotherPassword456!',
        })
        .expect(400);
      expect(reuseRes.body.error.code).toBe('RESET_TOKEN_INVALID');
    });
  });

  describe('POST /api/v1/auth/password-resets (P) & DB-T02 concurrency/transaction guarantees', () => {
    it('resets password with a valid token, does NOT auto-login, revokes existing sessions, and rejects token reuse', async () => {
      const { user, sessionCookie, csrfToken, csrfCookie } =
        await registerAndLoginLearner({
          email: 'reset.flow@example.com',
          password: 'OldPassword123!',
        });

      // Request reset #1, then request reset #2 (reset #1 must be invalidated by #2)
      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'reset.flow@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      const supersededToken = sentEmails[0].resetToken;

      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'reset.flow@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      const activeToken = sentEmails[1].resetToken;

      // Superseded token must fail with 400 RESET_TOKEN_INVALID
      const oldTokenRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: supersededToken,
          newPassword: 'BrandNewPassword123!',
        })
        .expect(400);
      expect(oldTokenRes.body.error.code).toBe('RESET_TOKEN_INVALID');

      // Active token succeeds with 204 and does NOT set ck_session cookie
      const resetRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: activeToken,
          newPassword: 'BrandNewPassword123!',
        })
        .expect(204);

      expect(
        extractCookiePair(resetRes.headers['set-cookie'], 'ck_session'),
      ).toBe('');

      // Token is marked usedAt and cannot be reused
      const reuseRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: activeToken,
          newPassword: 'AnotherNewPassword456!',
        })
        .expect(400);
      expect(reuseRes.body.error.code).toBe('RESET_TOKEN_INVALID');

      // Old session cookie is rejected on protected endpoint
      const meOldSession = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);
      expect(meOldSession.body.error.code).toBe('SESSION_EXPIRED');

      // Old password cannot login, new password logs in
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'reset.flow@example.com',
          password: 'OldPassword123!',
        })
        .expect(401);

      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'reset.flow@example.com',
          password: 'BrandNewPassword123!',
        })
        .expect(200);
      expect(newLogin.body.data.user.id).toBe(user.id);
    });

    it('rejects wrong token and expired token with the same 400 RESET_TOKEN_INVALID error code', async () => {
      const { user, csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'expired.token@example.com',
      });

      // 1. Completely unknown token
      const wrongRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: 'non-existent-random-reset-token',
          newPassword: 'ValidNewPassword123!',
        })
        .expect(400);
      expect(wrongRes.body.error.code).toBe('RESET_TOKEN_INVALID');

      // 2. Expired token (expiresAt in the past)
      const expiredRawToken = generatePasswordResetToken();
      const pastDate = new Date(Date.now() - 60 * 1000);
      await db.collection('password_reset_tokens').insertOne({
        _id: new ObjectId(),
        userId: new ObjectId(user.id),
        tokenHash: hashPasswordResetToken(expiredRawToken),
        expiresAt: pastDate,
        purgeAt: pastDate,
      });

      const expiredRes = await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: expiredRawToken,
          newPassword: 'ValidNewPassword123!',
        })
        .expect(400);
      expect(expiredRes.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('rejects a token that is valid when the HTTP request starts but expires during password hashing or before a transaction retry', async () => {
      const { user, csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'expire.midflight@example.com',
        password: 'OriginalPassword123!',
      });
      const userBefore = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });

      const t0 = new Date('2026-11-15T12:00:00.000Z');
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        // Case 1: Token is valid at request start (t0), but expires while hashPassword runs (t0 + 1500ms > expiresAt)
        vi.setSystemTime(t0);
        const rawToken = generatePasswordResetToken();
        const tokenHash = hashPasswordResetToken(rawToken);
        const expiresAt = new Date(t0.getTime() + 1000);
        await db.collection('password_reset_tokens').insertOne({
          _id: new ObjectId(),
          userId: new ObjectId(user.id),
          tokenHash,
          expiresAt,
          purgeAt: expiresAt,
        });

        const originalHashPassword = identityCrypto.hashPassword;
        const hashSpy = vi
          .spyOn(identityCrypto, 'hashPassword')
          .mockImplementationOnce(async (pw) => {
            vi.setSystemTime(new Date(t0.getTime() + 1500));
            return originalHashPassword(pw);
          });

        const res = await request(app)
          .post('/api/v1/auth/password-resets')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({
            token: rawToken,
            newPassword: 'ShouldNotApplyPassword123!',
          })
          .expect(400);

        hashSpy.mockRestore();
        expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');

        const userAfterHashExpiry = await db
          .collection('users')
          .findOne({ _id: new ObjectId(user.id) });
        expect(userAfterHashExpiry?.passwordHash).toBe(
          userBefore?.passwordHash,
        );
        expect(userAfterHashExpiry?.authVersion).toBe(userBefore?.authVersion);

        const tokenDocAfterHashExpiry = await db
          .collection('password_reset_tokens')
          .findOne({ tokenHash });
        expect(tokenDocAfterHashExpiry?.usedAt).toBeUndefined();

        // Case 2: Token is valid on transaction attempt 1, then expires before transaction retry attempt 2
        vi.setSystemTime(t0);
        const retryToken = generatePasswordResetToken();
        const retryTokenHash = hashPasswordResetToken(retryToken);
        await db.collection('password_reset_tokens').insertOne({
          _id: new ObjectId(),
          userId: new ObjectId(user.id),
          tokenHash: retryTokenHash,
          expiresAt,
          purgeAt: expiresAt,
        });

        let attempts = 0;
        await expect(
          resetPasswordWithToken(
            {
              token: retryToken,
              newPassword: 'ShouldNotApplyRetry123!',
            },
            {
              beforeCommit: async () => {
                attempts += 1;
                if (attempts === 1) {
                  vi.setSystemTime(new Date(t0.getTime() + 1500));
                  const transientErr = new mongoose.mongo.MongoError(
                    'Simulated transient transaction conflict',
                  );
                  transientErr.addErrorLabel('TransientTransactionError');
                  throw transientErr;
                }
              },
            },
          ),
        ).rejects.toMatchObject({
          status: 400,
          code: 'RESET_TOKEN_INVALID',
        });

        expect(attempts).toBe(1);
        const userAfterRetryExpiry = await db
          .collection('users')
          .findOne({ _id: new ObjectId(user.id) });
        expect(userAfterRetryExpiry?.passwordHash).toBe(
          userBefore?.passwordHash,
        );
        const retryTokenDoc = await db
          .collection('password_reset_tokens')
          .findOne({ tokenHash: retryTokenHash });
        expect(retryTokenDoc?.usedAt).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('DB-T02: concurrent password reset requests using the same valid token allow exactly 1 to succeed (204) and reject the rest with 400 RESET_TOKEN_INVALID', async () => {
      const { user, sessionCookie, csrfToken, csrfCookie } =
        await registerAndLoginLearner({
          email: 'concurrent.reset@example.com',
          password: 'InitialPassword123!',
        });

      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'concurrent.reset@example.com' })
        .expect(202);
      await flushBackgroundTasks();

      const sharedToken = sentEmails[0].resetToken;

      const candidatePasswords = [
        'ConcurrentNewPass1!',
        'ConcurrentNewPass2!',
        'ConcurrentNewPass3!',
      ];

      const responses = await Promise.all(
        candidatePasswords.map((newPassword) =>
          request(app)
            .post('/api/v1/auth/password-resets')
            .set('Origin', DEFAULT_ORIGIN)
            .set('Cookie', csrfCookie)
            .set('X-CSRF-Token', csrfToken)
            .send({
              token: sharedToken,
              newPassword,
            }),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 204);
      const rejected = responses.filter((r) => r.status === 400);

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const res of rejected) {
        expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
      }

      // Verify authVersion increased by exactly 1 and token is marked usedAt
      const updatedUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });
      expect(updatedUser?.authVersion).toBe(1);

      const tokenDoc = await db.collection('password_reset_tokens').findOne({
        tokenHash: hashPasswordResetToken(sharedToken),
      });
      expect(tokenDoc?.usedAt).toBeInstanceOf(Date);

      // Previous session is revoked
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);
    });

    it('rolls back all changes in TX-02 if an error occurs mid-transaction during password reset or password change', async () => {
      const { user, sessionCookie, csrfToken, csrfCookie } =
        await registerAndLoginLearner({
          email: 'rollback.test@example.com',
          password: 'BeforeRollback123!',
        });

      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'rollback.test@example.com' })
        .expect(202);
      await flushBackgroundTasks();

      const rawToken = sentEmails[0].resetToken;
      const userBefore = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });

      // 1. Simulate mid-transaction failure in resetPasswordWithToken
      await expect(
        resetPasswordWithToken(
          {
            token: rawToken,
            newPassword: 'AbortedPassword456!',
          },
          {
            beforeCommit: async () => {
              throw new Error('Simulated TX-02 failure before commit');
            },
          },
        ),
      ).rejects.toThrow('Simulated TX-02 failure before commit');

      // Token must still be unused, user passwordHash/authVersion unchanged, and session still active
      const tokenAfterRollback = await db
        .collection('password_reset_tokens')
        .findOne({ tokenHash: hashPasswordResetToken(rawToken) });
      expect(tokenAfterRollback?.usedAt).toBeUndefined();

      const userAfterResetRollback = await db
        .collection('users')
        .findOne({ _id: new ObjectId(user.id) });
      expect(userAfterResetRollback?.passwordHash).toBe(
        userBefore?.passwordHash,
      );
      expect(userAfterResetRollback?.authVersion).toBe(userBefore?.authVersion);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      // 2. Simulate mid-transaction failure in changeUserPassword
      await expect(
        changeUserPassword(
          {
            userId: user.id,
            rawBody: {
              currentPassword: 'BeforeRollback123!',
              newPassword: 'AbortedChange789!',
            },
          },
          {
            beforeCommit: async () => {
              throw new Error('Simulated password-change TX-02 failure');
            },
          },
        ),
      ).rejects.toThrow('Simulated password-change TX-02 failure');

      // Session is still active and token is still usable!
      await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      // Now complete the reset normally using the same unconsumed token
      await request(app)
        .post('/api/v1/auth/password-resets')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          token: rawToken,
          newPassword: 'FinalCommittedPassword123!',
        })
        .expect(204);
    });
  });

  describe('Rate limiting on POST /api/v1/auth/password-reset-requests (07 §11)', () => {
    it('enforces 3 requests / 15 minutes per hashed emailKey (even for nonexistent emails) and returns 429 with Retry-After', async () => {
      const { csrfToken, csrfCookie } = await getCsrfContext();

      for (let i = 0; i < 3; i += 1) {
        await request(app)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({ email: `  NonExistent.User@Example.com ` })
          .expect(202);
      }

      const fourthRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'nonexistent.user@example.com' })
        .expect(429);

      expect(fourthRes.body.error.code).toBe('RATE_LIMITED');
      expect(Number(fourthRes.headers['retry-after'])).toBeGreaterThan(0);

      // Verify raw email PII is never stored in rate_limits._id
      const rateLimitDocs = await db
        .collection('rate_limits')
        .find({})
        .toArray();
      expect(JSON.stringify(rateLimitDocs)).not.toContain(
        'nonexistent.user@example.com',
      );
    });

    it('enforces 20 requests / 15 minutes per IP across distinct emails and returns 429 with Retry-After', async () => {
      const { csrfToken, csrfCookie } = await getCsrfContext();

      for (let i = 1; i <= 20; i += 1) {
        await request(app)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', DEFAULT_ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({ email: `distinct.user.${i}@example.com` })
          .expect(202);
      }

      const twentyFirstRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'distinct.user.21@example.com' })
        .expect(429);

      expect(twentyFirstRes.body.error.code).toBe('RATE_LIMITED');
      expect(Number(twentyFirstRes.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('Concurrent requestPasswordReset email dispatch ordering (BE-007 review)', () => {
    /**
     * @returns {{ promise: Promise<void>, resolve: () => void, reject: (err: unknown) => void }}
     */
    function deferred() {
      /** @type {() => void} */
      let resolve = () => {};
      /** @type {(err: unknown) => void} */
      let reject = () => {};
      const promise = new Promise((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    /**
     * Starts a requestPasswordReset call and pauses inside `sendResetEmail` until
     * the returned gate is resolved/rejected, deterministically controlling completion order.
     *
     * @param {string} email
     */
    async function startPausedResetRequest(email) {
      const entered = deferred();
      const gate = deferred();
      let capturedToken = '';
      /** @type {Array<Promise<unknown>>} */
      const registeredTasks = [];
      const response = await requestPasswordReset(
        { email },
        {
          sendResetEmail: async ({ resetToken }) => {
            capturedToken = resetToken;
            entered.resolve();
            await gate.promise;
          },
          waitUntil: (promise) => {
            registeredTasks.push(Promise.resolve(promise));
          },
        },
      );
      await entered.promise;
      return {
        token: capturedToken,
        response,
        complete: async () => {
          gate.resolve();
          await Promise.allSettled(registeredTasks);
          return response;
        },
        fail: async (error = new Error('Brevo send failed')) => {
          gate.reject(error);
          await Promise.allSettled(registeredTasks);
          return response;
        },
      };
    }

    it('keeps the newer token valid when A completes email dispatch before B', async () => {
      await registerAndLoginLearner();

      const reqA = await startPausedResetRequest('hanh.nhi@example.com');
      const reqB = await startPausedResetRequest('hanh.nhi@example.com');

      await reqA.complete();
      await reqB.complete();

      // Older token A is superseded; newer token B remains usable once.
      await expect(
        resetPasswordWithToken({
          token: reqA.token,
          newPassword: 'NewPasswordA123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: reqB.token,
          newPassword: 'NewPasswordB123!',
        }),
      ).resolves.toBeUndefined();

      // Single-use check
      await expect(
        resetPasswordWithToken({
          token: reqB.token,
          newPassword: 'NewPasswordB456!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });
    });

    it('keeps the newer token valid when B completes email dispatch before A (no mutual invalidation)', async () => {
      await registerAndLoginLearner();

      const reqA = await startPausedResetRequest('hanh.nhi@example.com');
      const reqB = await startPausedResetRequest('hanh.nhi@example.com');

      await reqB.complete();
      await reqA.complete();

      await expect(
        resetPasswordWithToken({
          token: reqA.token,
          newPassword: 'NewPasswordA123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: reqB.token,
          newPassword: 'NewPasswordB123!',
        }),
      ).resolves.toBeUndefined();
    });

    it('keeps A valid when B fails email dispatch (whether A finishes before or after B)', async () => {
      await registerAndLoginLearner();

      const reqA = await startPausedResetRequest('hanh.nhi@example.com');
      const reqB = await startPausedResetRequest('hanh.nhi@example.com');

      const resB = await reqB.fail();
      const resA = await reqA.complete();

      // Neutral 202 payload is preserved even on failure
      expect(resA).toEqual(resB);

      await expect(
        resetPasswordWithToken({
          token: reqB.token,
          newPassword: 'FailedTokenB123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: reqA.token,
          newPassword: 'ValidTokenA123!',
        }),
      ).resolves.toBeUndefined();
    });

    it('keeps an existing valid link C intact when concurrent requests A and B both fail email dispatch', async () => {
      await registerAndLoginLearner();

      const reqC = await startPausedResetRequest('hanh.nhi@example.com');
      await reqC.complete();

      const reqA = await startPausedResetRequest('hanh.nhi@example.com');
      const reqB = await startPausedResetRequest('hanh.nhi@example.com');

      const resB = await reqB.fail();
      const resA = await reqA.fail();

      expect(resA).toEqual({ message: NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE });
      expect(resB).toEqual(resA);

      await expect(
        resetPasswordWithToken({
          token: reqA.token,
          newPassword: 'FailedTokenA123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: reqB.token,
          newPassword: 'FailedTokenB123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: reqC.token,
          newPassword: 'ValidTokenC123!',
        }),
      ).resolves.toBeUndefined();

      await expect(
        resetPasswordWithToken({
          token: reqC.token,
          newPassword: 'ValidTokenC456!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });
    });
  });

  describe('Non-blocking waitUntil email dispatch (BE-007 review)', () => {
    /**
     * @returns {{ promise: Promise<void>, resolve: () => void, reject: (err: unknown) => void }}
     */
    function deferred() {
      /** @type {() => void} */
      let resolve = () => {};
      /** @type {(err: unknown) => void} */
      let reject = () => {};
      const promise = new Promise((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it('returns 202 for active accounts while Brevo is still pending, then completes post-response success cleanup via waitUntil', async () => {
      const { csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'async.active@example.com',
        password: 'InitialPassword123!',
      });
      const locked = await registerAndLoginLearner({
        email: 'async.locked@example.com',
      });
      await db
        .collection('users')
        .updateOne(
          { _id: new ObjectId(locked.user.id) },
          { $set: { status: 'locked' } },
        );

      // Issue initial valid link A
      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.active@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      expect(sentEmails).toHaveLength(1);
      const tokenA = sentEmails[0].resetToken;

      // Hold Brevo pending for request B on the active account
      const brevoEntered = deferred();
      const brevoGate = deferred();
      let brevoResolved = false;
      emailSenderFailureHook = async () => {
        brevoEntered.resolve();
        await brevoGate.promise;
        brevoResolved = true;
      };

      const activeRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.active@example.com' })
        .expect(202);

      // Active account must receive 202 BEFORE Brevo resolves (same as nonexistent and locked)
      expect(brevoResolved).toBe(false);
      await brevoEntered.promise;
      expect(brevoResolved).toBe(false);
      expect(pendingBackgroundTasks).toHaveLength(1);

      const missingRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.missing@example.com' })
        .expect(202);

      const lockedRes = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.locked@example.com' })
        .expect(202);

      expect(activeRes.body.data).toEqual({
        message: NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE,
      });
      expect(missingRes.body.data).toEqual(activeRes.body.data);
      expect(lockedRes.body.data).toEqual(activeRes.body.data);

      // Now release Brevo and flush waitUntil background work
      brevoGate.resolve();
      await flushBackgroundTasks();
      expect(brevoResolved).toBe(true);
      expect(sentEmails).toHaveLength(2);
      const tokenB = sentEmails[1].resetToken;

      // Post-response success invalidated token A and kept token B usable once
      await expect(
        resetPasswordWithToken({
          token: tokenA,
          newPassword: 'OldLinkPassword123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });

      await expect(
        resetPasswordWithToken({
          token: tokenB,
          newPassword: 'NewLinkPassword123!',
        }),
      ).resolves.toBeUndefined();
    });

    it('returns 202 while Brevo is pending and preserves earlier valid link if post-response send rejects', async () => {
      const { csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'async.fail@example.com',
        password: 'InitialPassword123!',
      });

      // Issue initial valid link A
      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.fail@example.com' })
        .expect(202);
      await flushBackgroundTasks();
      const tokenA = sentEmails[0].resetToken;

      // Hold Brevo pending for link B, then reject post-response
      const brevoEntered = deferred();
      const brevoGate = deferred();
      emailSenderFailureHook = async () => {
        brevoEntered.resolve();
        await brevoGate.promise;
      };

      const res = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.fail@example.com' })
        .expect(202);

      expect(res.body.data).toEqual({
        message: NEUTRAL_PASSWORD_RESET_REQUEST_MESSAGE,
      });
      await brevoEntered.promise;
      expect(pendingBackgroundTasks).toHaveLength(1);

      brevoGate.reject(new Error('Brevo upstream timeout'));
      await flushBackgroundTasks();

      // Undelivered token B was invalidated; earlier valid link A remains usable
      await expect(
        resetPasswordWithToken({
          token: tokenA,
          newPassword: 'RecoveredAfterAsyncFail123!',
        }),
      ).resolves.toBeUndefined();
    });

    it('invalidates newly issued token in post-response transaction if account is locked while Brevo is in flight', async () => {
      const { user, csrfToken, csrfCookie } = await registerAndLoginLearner({
        email: 'async.lockrace@example.com',
        password: 'InitialPassword123!',
      });

      const brevoEntered = deferred();
      const brevoGate = deferred();
      emailSenderFailureHook = async () => {
        brevoEntered.resolve();
        await brevoGate.promise;
      };

      await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'async.lockrace@example.com' })
        .expect(202);

      await brevoEntered.promise;

      // Admin locks account while Brevo request is still in flight
      await db
        .collection('users')
        .updateOne(
          { _id: new ObjectId(user.id) },
          { $set: { status: 'locked' } },
        );

      brevoGate.resolve();
      await flushBackgroundTasks();

      expect(sentEmails).toHaveLength(1);
      const deliveredToken = sentEmails[0].resetToken;
      const stored = await db
        .collection('password_reset_tokens')
        .findOne({ tokenHash: hashPasswordResetToken(deliveredToken) });
      expect(stored?.invalidatedAt).toBeInstanceOf(Date);

      await expect(
        resetPasswordWithToken({
          token: deliveredToken,
          newPassword: 'ShouldNotWorkLocked123!',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });
    });
  });
});
