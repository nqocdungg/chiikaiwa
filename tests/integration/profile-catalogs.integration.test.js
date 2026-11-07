import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
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
import { hashGuestCredential } from '../../server/modules/identity/crypto.js';
import { toPartnerDto } from '../../server/modules/identity/dto.js';
import { updateUserProfile } from '../../server/modules/identity/identity-service.js';
import { assertValidationError } from '../helpers/contract-helpers.js';

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

/**
 * Registers and logs in a learner account, returning session cookie, csrf context, and initial Self DTO.
 * @param {{ email: string, password?: string, displayName: string }} params
 */
async function registerAndLogin({
  email,
  password = 'ValidPassword123',
  displayName,
}) {
  const { csrfToken, csrfCookie } = await getCsrfContext();

  await request(app)
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
    csrfToken,
    csrfCookie,
    sessionCookie,
    combinedCookie: `${csrfCookie}; ${sessionCookie}`,
    user: loginRes.body.data.user,
  };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_profile_integration_test');
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
    db.collection('operation_receipts').deleteMany({}),
    db.collection('statistics').deleteMany({}),
    db.collection('rate_limits').deleteMany({}),
  ]);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-002 Profile & Catalogs replica-set integration tests', () => {
  it('updates profile fields, preserves omitted nested fields on partial PATCH, clears optional fields with null, and reflects changes in GET /auth/me', async () => {
    const catalogsRes = await request(app).get('/api/v1/catalogs').expect(200);
    /** @type {{ avatars: Array<{ code: string; label: string }> }} */
    const catalogs = catalogsRes.body.data;

    const { csrfToken, combinedCookie, sessionCookie, user } =
      await registerAndLogin({
        email: 'learner.profile@example.com',
        displayName: 'Hạnh Nhi',
      });

    // Newly registered account has default avatar in catalogs and unset optional profile fields
    expect(catalogs.avatars.map((a) => a.code)).toContain(user.avatarKey);
    expect(user.profile).toEqual({ interests: [] });
    expect(user.version).toBe(0);

    // 1. Full profile update
    const patch1 = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 0,
        displayName: '  Hạnh Nhi Nguyễn  ',
        avatarKey: 'hachiware',
        profile: {
          level: 'N4',
          nativeLanguageCode: 'vi',
          goal: 'dailyCommunication',
          interests: ['music', 'filmAndAnime', 'travel'],
          countryCode: 'VN',
          ageGroup: '18to22',
          gender: 'female',
        },
      })
      .expect(200);

    expect(patch1.body.data).toEqual({
      id: user.id,
      email: 'learner.profile@example.com',
      displayName: 'Hạnh Nhi Nguyễn',
      avatarKey: 'hachiware',
      role: 'learner',
      profile: {
        level: 'N4',
        nativeLanguageCode: 'vi',
        goal: 'dailyCommunication',
        interests: ['music', 'filmAndAnime', 'travel'],
        countryCode: 'VN',
        ageGroup: '18to22',
        gender: 'female',
      },
      version: 1,
    });

    // Read back via GET /api/v1/auth/me
    const me1 = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(me1.body.data).toEqual({
      kind: 'user',
      user: patch1.body.data,
    });

    // 2. Partial nested PATCH: sending only profile.goal keeps level, interests, and all other fields intact
    const patch2 = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 1,
        profile: {
          goal: 'examPreparation',
        },
      })
      .expect(200);

    expect(patch2.body.data).toEqual({
      id: user.id,
      email: 'learner.profile@example.com',
      displayName: 'Hạnh Nhi Nguyễn',
      avatarKey: 'hachiware',
      role: 'learner',
      profile: {
        level: 'N4',
        nativeLanguageCode: 'vi',
        goal: 'examPreparation',
        interests: ['music', 'filmAndAnime', 'travel'],
        countryCode: 'VN',
        ageGroup: '18to22',
        gender: 'female',
      },
      version: 2,
    });

    // 3. Clearing optional fields with null unsets them in DB while preserving remaining fields
    const patch3 = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 2,
        profile: {
          goal: null,
          ageGroup: null,
          gender: null,
        },
      })
      .expect(200);

    expect(patch3.body.data.profile).toEqual({
      level: 'N4',
      nativeLanguageCode: 'vi',
      interests: ['music', 'filmAndAnime', 'travel'],
      countryCode: 'VN',
    });
    expect(patch3.body.data.profile).not.toHaveProperty('goal');
    expect(patch3.body.data.profile).not.toHaveProperty('ageGroup');
    expect(patch3.body.data.profile).not.toHaveProperty('gender');
    expect(patch3.body.data.version).toBe(3);

    const rawUserInDb = await db
      .collection('users')
      .findOne({ _id: new ObjectId(user.id) });
    expect(rawUserInDb?.profile).not.toHaveProperty('goal');
    expect(rawUserInDb?.profile).not.toHaveProperty('ageGroup');
    expect(rawUserInDb?.profile).not.toHaveProperty('gender');

    // Verify Partner DTO built from the persisted user document omits email and private fields
    const partnerDto = toPartnerDto(rawUserInDb ?? {});
    expect(partnerDto).toEqual({
      actorKey: `user:${user.id}`,
      displayName: 'Hạnh Nhi Nguyễn',
      avatarKey: 'hachiware',
      profile: {
        level: 'N4',
        nativeLanguageCode: 'vi',
        interests: ['music', 'filmAndAnime', 'travel'],
        countryCode: 'VN',
      },
    });
    expect(partnerDto).not.toHaveProperty('email');
  });

  it('rejects invalid enums, null on required fields, >3 interests, duplicate interests, overly long displayName, unknown fields, and role tampering without modifying persisted data', async () => {
    const { csrfToken, combinedCookie, sessionCookie, user } =
      await registerAndLogin({
        email: 'validation.guard@example.com',
        displayName: 'Nguyên Bản',
      });

    // Seed an initial valid profile (version 0 -> 1)
    const initialRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 0,
        avatarKey: 'usagi',
        profile: {
          level: 'N3',
          goal: 'travel',
          interests: ['food', 'books'],
        },
      })
      .expect(200);

    const committedSnapshot = initialRes.body.data;
    expect(committedSnapshot.version).toBe(1);

    const invalidPayloads = [
      // Missing expectedVersion
      { displayName: 'Tên mới' },
      // Null on required fields
      { expectedVersion: null, displayName: 'Tên mới' },
      { expectedVersion: 1, displayName: null },
      { expectedVersion: 1, avatarKey: null },
      { expectedVersion: 1, profile: null },
      { expectedVersion: 1, profile: { interests: null } },
      // Invalid enums
      { expectedVersion: 1, avatarKey: 'invalid-mascot' },
      { expectedVersion: 1, profile: { level: 'N0' } },
      { expectedVersion: 1, profile: { goal: 'becomeFluentOvernight' } },
      { expectedVersion: 1, profile: { interests: ['music', 'invalidCode'] } },
      { expectedVersion: 1, profile: { nativeLanguageCode: 'invalid-lang' } },
      { expectedVersion: 1, profile: { countryCode: 'INVALID' } },
      { expectedVersion: 1, profile: { ageGroup: '99plus' } },
      { expectedVersion: 1, profile: { gender: 'unknown' } },
      // More than 3 interests
      {
        expectedVersion: 1,
        profile: { interests: ['music', 'food', 'travel', 'books'] },
      },
      // Duplicate interests
      {
        expectedVersion: 1,
        profile: { interests: ['food', 'food'] },
      },
      // Overly long displayName (> 100 Unicode code points) or blank displayName
      {
        expectedVersion: 1,
        displayName: '🌸'.repeat(101),
      },
      {
        expectedVersion: 1,
        displayName: '    ',
      },
      // Unknown fields or attempting to escalate role / change status / authVersion / id
      {
        expectedVersion: 1,
        displayName: 'Hacker',
        role: 'admin',
      },
      {
        expectedVersion: 1,
        status: 'locked',
        authVersion: 10,
      },
      {
        expectedVersion: 1,
        id: new ObjectId().toHexString(),
      },
      {
        expectedVersion: 1,
        profile: {
          level: 'N2',
          desiredMinutes: 20,
        },
      },
    ];

    for (const payload of invalidPayloads) {
      const res = await request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send(payload)
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(res.body.error.details?.fields)).toBe(true);
      expect(res.body.error.details.fields.length).toBeGreaterThan(0);
    }

    // Verify stored user record and GET /auth/me remain completely untouched at version 1
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(meRes.body.data.user).toEqual(committedSnapshot);

    const dbUser = await db
      .collection('users')
      .findOne({ _id: new ObjectId(user.id) });
    expect(dbUser?.role).toBe('learner');
    expect(dbUser?.version).toBe(1);
    expect(dbUser?.displayName).toBe('Nguyên Bản');
  });

  it('enforces atomic CAS when two concurrent PATCH requests send the same expectedVersion: exactly one succeeds (200) and one fails (409 VERSION_CONFLICT)', async () => {
    const { csrfToken, combinedCookie, sessionCookie, user } =
      await registerAndLogin({
        email: 'concurrent.tabs@example.com',
        displayName: 'Tab Ban Đầu',
      });

    const payloadTabA = {
      expectedVersion: 0,
      displayName: 'Cập nhật từ Tab A',
      avatarKey: 'hachiware',
      profile: {
        level: 'N4',
        goal: 'dailyCommunication',
        interests: ['music'],
      },
    };

    const payloadTabB = {
      expectedVersion: 0,
      displayName: 'Cập nhật từ Tab B',
      avatarKey: 'momonga',
      profile: {
        level: 'N2',
        goal: 'studyAndWork',
        interests: ['technology', 'games'],
      },
    };

    const [resA, resB] = await Promise.all([
      request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send(payloadTabA),
      request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send(payloadTabB),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const winnerRes = resA.status === 200 ? resA : resB;
    const loserRes = resA.status === 409 ? resA : resB;

    expect(winnerRes.body.data.version).toBe(1);
    expect(loserRes.body.error.code).toBe('VERSION_CONFLICT');
    expect(loserRes.body.error.details).toEqual({ currentVersion: 1 });

    // Final database state must match the winning request and have version === 1
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(meRes.body.data.user).toEqual(winnerRes.body.data);

    const dbUser = await db
      .collection('users')
      .findOne({ _id: new ObjectId(user.id) });
    expect(dbUser?.version).toBe(1);
    expect(dbUser?.displayName).toBe(winnerRes.body.data.displayName);
  });

  it('blocks anonymous, guest, locked account, and invalid CSRF/Origin requests, and prevents one account from modifying another account', async () => {
    const userA = await registerAndLogin({
      email: 'user.a@example.com',
      displayName: 'User A',
    });
    const userB = await registerAndLogin({
      email: 'user.b@example.com',
      displayName: 'User B',
    });

    // 1. Anonymous caller (no session cookie) -> 401 AUTH_REQUIRED
    const anonRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', userA.csrfCookie)
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ expectedVersion: 0, displayName: 'Anon' })
      .expect(401);
    expect(anonRes.body.error.code).toBe('AUTH_REQUIRED');

    // 2. Guest caller -> 403 FORBIDDEN
    const rawGuestToken = 'guest-token-cannot-edit-profile';
    await db.collection('guest_sessions').insertOne({
      _id: new ObjectId(),
      credentialHash: hashGuestCredential(rawGuestToken),
      invitationId: new ObjectId(),
      practiceSessionId: new ObjectId(),
      status: 'active',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      version: 0,
      cleanupState: 'pending',
    });

    const guestRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', `${userA.csrfCookie}; ck_guest=${rawGuestToken}`)
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ expectedVersion: 0, displayName: 'Guest' })
      .expect(403);
    expect(guestRes.body.error.code).toBe('FORBIDDEN');

    // 3. Invalid CSRF / Origin -> 403 CSRF_INVALID
    const badCsrfRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', userA.combinedCookie)
      .set('X-CSRF-Token', '0'.repeat(64))
      .send({ expectedVersion: 0, displayName: 'Bad CSRF' })
      .expect(403);
    expect(badCsrfRes.body.error.code).toBe('CSRF_INVALID');

    const badOriginRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', userA.combinedCookie)
      .set('X-CSRF-Token', userA.csrfToken)
      .send({ expectedVersion: 0, displayName: 'Bad Origin' })
      .expect(403);
    expect(badOriginRes.body.error.code).toBe('CSRF_INVALID');

    // 4. User A updating profile only affects User A, never User B
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', userA.combinedCookie)
      .set('X-CSRF-Token', userA.csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 0,
        displayName: 'User A Updated',
        profile: { level: 'N2' },
      })
      .expect(200);

    // User A attempting to pass User B's ID in body is rejected with 422 UNKNOWN_FIELD
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', userA.combinedCookie)
      .set('X-CSRF-Token', userA.csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: 1,
        userId: userB.user.id,
        displayName: 'Overwrite B',
      })
      .expect(422);

    const meB = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', userB.sessionCookie)
      .expect(200);
    expect(meB.body.data.user.displayName).toBe('User B');
    expect(meB.body.data.user.version).toBe(0);

    // 5. Locked account -> 403 ACCOUNT_LOCKED
    await db
      .collection('users')
      .updateOne(
        { _id: new ObjectId(userA.user.id) },
        { $set: { status: 'locked' } },
      );

    const lockedRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', userA.combinedCookie)
      .set('X-CSRF-Token', userA.csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1, displayName: 'Locked Update' })
      .expect(403);
    expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rejects missing, empty, whitespace-only, and non-UUID Idempotency-Key headers on HTTP and direct service calls without modifying profile/version or operation_receipts', async () => {
    const { csrfToken, combinedCookie, sessionCookie, user } =
      await registerAndLogin({
        email: 'idempotency.guard@example.com',
        displayName: 'Before Guard Test',
      });

    // 1. Missing Idempotency-Key header
    const missingKeyRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        expectedVersion: 0,
        displayName: 'Should Not Commit',
      });
    assertValidationError(missingKeyRes, [
      { path: 'Idempotency-Key', code: 'INVALID_UUID' },
    ]);

    // 2. Empty, whitespace-only, and non-UUID Idempotency-Key headers
    for (const invalidHeader of [
      '',
      '   ',
      'not-a-uuid',
      '12345',
      '550e8400-e29b-01d4-a716-446655440000',
    ]) {
      const res = await request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', invalidHeader)
        .send({
          expectedVersion: 0,
          displayName: 'Should Not Commit',
        });
      assertValidationError(res, [
        { path: 'Idempotency-Key', code: 'INVALID_UUID' },
      ]);
    }

    // 3. Direct service calls with missing, empty, whitespace, or non-UUID idempotencyKey
    for (const invalidServiceKey of [undefined, '', '   ', 'invalid-uuid']) {
      await expect(
        updateUserProfile({
          userId: user.id,
          rawBody: {
            expectedVersion: 0,
            displayName: 'Direct Call Bypass Attempt',
          },
          idempotencyKey: /** @type {any} */ (invalidServiceKey),
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }

    // Verify neither users nor operation_receipts was modified
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(meRes.body.data.user.displayName).toBe('Before Guard Test');
    expect(meRes.body.data.user.version).toBe(0);

    const receiptCount = await db
      .collection('operation_receipts')
      .countDocuments({});
    expect(receiptCount).toBe(0);
  });

  it('replays committed PATCH /me/profile on same Idempotency-Key without double-incrementing version, rejects modified payload with 409 IDEMPOTENCY_CONFLICT, handles concurrent identical retries atomically, and rejects replay after account is locked', async () => {
    const { csrfToken, combinedCookie, sessionCookie, user } =
      await registerAndLogin({
        email: 'idempotent.profile@example.com',
        displayName: 'Initial Name',
      });

    // Use a valid non-v4 UUID (v1) to verify any RFC UUID version 1..8 is accepted
    const idempotencyKey = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

    // 1. Initial PATCH with Idempotency-Key commits and increments version to 1
    const firstRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        expectedVersion: 0,
        displayName: 'Idempotent Updated',
        profile: { level: 'N3', nativeLanguageCode: 'vi' },
      })
      .expect(200);

    expect(firstRes.body.data).toMatchObject({
      id: user.id,
      displayName: 'Idempotent Updated',
      version: 1,
      profile: {
        level: 'N3',
        nativeLanguageCode: 'vi',
        interests: [],
      },
    });

    // 2. Retry same intent with same Idempotency-Key (even uppercase UUID and reordered JSON keys) replays 200 without incrementing version
    const replayRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey.toUpperCase())
      .send({
        profile: { nativeLanguageCode: 'vi', level: 'N3' },
        displayName: 'Idempotent Updated',
        expectedVersion: 0,
      })
      .expect(200);

    expect(replayRes.body.data).toEqual(firstRes.body.data);

    // 3. Reusing the same Idempotency-Key with a different payload returns 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        expectedVersion: 0,
        displayName: 'Different Intent',
        profile: { level: 'N2' },
      })
      .expect(409);

    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    // 4. New Idempotency-Key with stale expectedVersion: 0 returns 409 VERSION_CONFLICT
    const staleRes = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', '660e8400-e29b-41d4-a716-446655440001')
      .send({
        expectedVersion: 0,
        displayName: 'Stale Intent',
      })
      .expect(409);

    expect(staleRes.body.error.code).toBe('VERSION_CONFLICT');
    expect(staleRes.body.error.details).toEqual({ currentVersion: 1 });

    // 5. Two concurrent requests with the SAME Idempotency-Key and SAME payload:
    //    exactly one update occurs (version 1 -> 2), one receipt is stored, and both return 200 with version 2
    const concurrentKey = '550e8400-e29b-41d4-a716-446655440099';
    const concurrentPayload = {
      expectedVersion: 1,
      displayName: 'Concurrent Same Intent',
      profile: { level: 'N2', goal: 'studyAndWork' },
    };

    const [concRes1, concRes2] = await Promise.all([
      request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', concurrentKey)
        .send(concurrentPayload),
      request(app)
        .patch('/api/v1/me/profile')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', combinedCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', concurrentKey)
        .send(concurrentPayload),
    ]);

    expect(concRes1.status).toBe(200);
    expect(concRes2.status).toBe(200);
    expect(concRes1.body.data.version).toBe(2);
    expect(concRes2.body.data).toEqual(concRes1.body.data);

    const concurrentReceipts = await db
      .collection('operation_receipts')
      .find({ operationId: concurrentKey })
      .toArray();
    expect(concurrentReceipts).toHaveLength(1);

    // 6. Coexistence check: GET /api/v1/me/coordination works alongside /me/profile
    const coordRes = await request(app)
      .get('/api/v1/me/coordination')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(coordRes.body.data).toEqual({ mode: 'idle', version: 0 });

    // 7. Replay after account is locked is rejected with 403 ACCOUNT_LOCKED (both HTTP and direct service call)
    await db
      .collection('users')
      .updateOne(
        { _id: new ObjectId(user.id) },
        { $set: { status: 'locked' } },
      );

    const lockedReplayHttp = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', DEFAULT_ORIGIN)
      .set('Cookie', combinedCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', concurrentKey)
      .send(concurrentPayload)
      .expect(403);
    expect(lockedReplayHttp.body.error.code).toBe('ACCOUNT_LOCKED');

    await expect(
      updateUserProfile({
        userId: user.id,
        rawBody: concurrentPayload,
        idempotencyKey: concurrentKey,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_LOCKED',
    });
  });
});
