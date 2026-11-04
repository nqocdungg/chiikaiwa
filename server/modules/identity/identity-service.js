import mongoose from 'mongoose';
import { readAuthEnv } from '../../config/env.js';
import { AppError } from '../../middleware/http-error.js';
import { SESSION_MAX_AGE_MS } from '../../middleware/cookies.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  hashGuestCredential,
  hashPassword,
  signJwt,
  verifyDummyPassword,
  verifyJwt,
  verifyJwtIgnoreExpiration,
  verifyPassword,
} from './crypto.js';
import { DEFAULT_AVATAR_KEY, toSelfDto } from './dto.js';
import {
  validateEmptyObjectInput,
  validateLoginInput,
  validateRegisterInput,
} from './validation.js';

const { ObjectId } = mongoose.Types;

/**
 * Registers a new learner account in transaction TX-01 (users, actor_states, statistics.registeredAccounts).
 * Does NOT auto-login, does NOT send verification email, and never assigns admin role.
 *
 * @param {unknown} rawBody
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ user: ReturnType<typeof toSelfDto> }>}
 */
export async function registerUser(rawBody, { now = new Date() } = {}) {
  const { email, emailKey, password, displayName } =
    validateRegisterInput(rawBody);

  // Hash password outside the MongoDB transaction to keep transaction short (05 §5.2, 06 §11.1)
  const passwordHash = await hashPassword(password);
  const userId = new ObjectId();
  const actorKey = `user:${userId.toHexString()}`;

  const userDoc = {
    _id: userId,
    email,
    emailKey,
    passwordHash,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName,
    avatarKey: DEFAULT_AVATAR_KEY,
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  const actorStateDoc = {
    _id: actorKey,
    mode: 'idle',
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  const db = await connectDatabase();

  try {
    await withTransaction(async (session) => {
      await db.collection('users').insertOne(userDoc, { session });
      await db
        .collection('actor_states')
        .insertOne(/** @type {any} */ (actorStateDoc), { session });
      await db.collection('statistics').updateOne(
        /** @type {any} */ ({ _id: 'lifetime' }),
        {
          $inc: { registeredAccounts: 1 },
          $set: { updatedAt: now },
          $setOnInsert: {
            startedSessions: 0,
            reviewCount: 0,
            submittedQuizCount: 0,
          },
        },
        { upsert: true, session },
      );
    });
  } catch (err) {
    if (/** @type {{ code?: number }} */ (err)?.code === 11000) {
      throw new AppError({
        status: 409,
        code: 'EMAIL_EXISTS',
        message: 'Email này đã được đăng ký.',
      });
    }
    throw err;
  }

  return {
    user: toSelfDto(userDoc),
  };
}

/**
 * Authenticates a user by email and password, checks account status ONLY after valid password,
 * creates an auth_sessions record with max 7 days absolute expiry, and signs a session JWT.
 *
 * @param {unknown} rawBody
 * @param {{ now?: Date, envSource?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ user: ReturnType<typeof toSelfDto>, expiresAt: Date, jwtToken: string }>}
 */
export async function loginUser(
  rawBody,
  { now = new Date(), envSource = process.env } = {},
) {
  const { emailKey, password } = validateLoginInput(rawBody);
  const authEnv = readAuthEnv(envSource);
  const db = await connectDatabase();

  const userDoc = await db.collection('users').findOne({ emailKey });
  if (!userDoc || typeof userDoc.passwordHash !== 'string') {
    await verifyDummyPassword(password);
    throw new AppError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
    });
  }

  const isPasswordValid = await verifyPassword(password, userDoc.passwordHash);
  if (!isPasswordValid) {
    throw new AppError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
    });
  }

  // Per 07 §4: locked account is reported ONLY after valid password authentication
  if (userDoc.status === 'locked') {
    throw new AppError({
      status: 403,
      code: 'ACCOUNT_LOCKED',
      message: 'Tài khoản của bạn đã bị khóa.',
    });
  }

  const sessionId = new ObjectId();
  const issuedAt = now;
  const expiresAt = new Date(issuedAt.getTime() + SESSION_MAX_AGE_MS);
  const authVersion =
    typeof userDoc.authVersion === 'number' ? userDoc.authVersion : 0;

  await db.collection('auth_sessions').insertOne({
    _id: sessionId,
    userId: userDoc._id,
    authVersion,
    issuedAt,
    expiresAt,
    purgeAt: expiresAt,
  });

  const jwtToken = signJwt(
    {
      sub: userDoc._id.toHexString(),
      sid: sessionId.toHexString(),
      authVersion,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    authEnv.jwtSecret,
    {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
    },
  );

  return {
    user: toSelfDto(userDoc),
    expiresAt,
    jwtToken,
  };
}

/**
 * Revokes the current session credential (user or guest) in the database.
 * - If both user and guest cookies are present and the user cookie is active,
 *   the user account is the executing identity (07 §2.1), so only the user session
 *   is revoked and cleared while preserving the guest session.
 * - If a guest cookie is the executing identity, revokes the guest credential in
 *   `guest_sessions` (`revokedAt` + version increment) without deleting the root
 *   `guest_sessions` document or child learning/history records needed for cleanup.
 * - Repeated logout with an already-expired or already-revoked cookie remains safe (204).
 *
 * @param {Object} params
 * @param {string | undefined} params.authCookie
 * @param {string | undefined} params.guestCookie
 * @param {unknown} params.rawBody
 * @param {Date} [params.now]
 * @param {NodeJS.ProcessEnv} [params.envSource]
 * @returns {Promise<{ clearAuth: boolean, clearGuest: boolean }>}
 */
export async function logoutSession({
  authCookie,
  guestCookie,
  rawBody,
  now = new Date(),
  envSource = process.env,
}) {
  validateEmptyObjectInput(rawBody);

  const hasAuthCookie =
    typeof authCookie === 'string' && authCookie.trim().length > 0;
  const hasGuestCookie =
    typeof guestCookie === 'string' && guestCookie.trim().length > 0;

  if (!hasAuthCookie && !hasGuestCookie) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  const db = await connectDatabase();
  const authEnv = readAuthEnv(envSource);
  let activeUserRevoked = false;

  if (hasAuthCookie) {
    const activeClaims = verifyJwt(authCookie, authEnv.jwtSecret, {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
      now,
    });

    if (activeClaims) {
      const sessionObjectId = new ObjectId(activeClaims.sid);
      const userObjectId = new ObjectId(activeClaims.sub);
      const [sessionDoc, userDoc] = await Promise.all([
        db
          .collection('auth_sessions')
          .findOne({ _id: sessionObjectId, userId: userObjectId }),
        db.collection('users').findOne({ _id: userObjectId }),
      ]);

      const isActiveUserSession =
        Boolean(sessionDoc) &&
        !sessionDoc?.revokedAt &&
        sessionDoc?.expiresAt instanceof Date &&
        sessionDoc.expiresAt.getTime() > now.getTime() &&
        sessionDoc?.authVersion === activeClaims.authVersion &&
        Boolean(userDoc) &&
        userDoc?.status === 'active' &&
        userDoc?.authVersion === activeClaims.authVersion;

      if (isActiveUserSession) {
        activeUserRevoked = true;
      }
    }

    const decoded =
      activeClaims ??
      verifyJwtIgnoreExpiration(authCookie, authEnv.jwtSecret, {
        issuer: authEnv.jwtIssuer,
        audience: authEnv.jwtAudience,
      });

    if (decoded) {
      await db.collection('auth_sessions').updateOne(
        {
          _id: new ObjectId(decoded.sid),
          userId: new ObjectId(decoded.sub),
          revokedAt: { $exists: false },
        },
        {
          $set: { revokedAt: now },
        },
      );
    }
  }

  // If the request had a valid active user session, user is the executing identity (07 §2.1):
  // do not revoke or clear a coexisting guest session.
  if (activeUserRevoked) {
    return {
      clearAuth: true,
      clearGuest: false,
    };
  }

  if (hasGuestCookie) {
    const credentialHash = hashGuestCredential(guestCookie);
    await db.collection('guest_sessions').updateOne(
      {
        credentialHash,
        revokedAt: { $exists: false },
      },
      {
        $set: { revokedAt: now },
        $inc: { version: 1 },
      },
    );
  }

  return {
    clearAuth: hasAuthCookie,
    clearGuest: hasGuestCookie,
  };
}

/**
 * Resolves the active caller identity (`user` or `guest`) from cookies and database state.
 * User cookie takes precedence if both user and guest cookies are present and user is valid (07 §2.1).
 *
 * @param {Object} params
 * @param {string | undefined} params.authCookie
 * @param {string | undefined} params.guestCookie
 * @param {Date} [params.now]
 * @param {NodeJS.ProcessEnv} [params.envSource]
 */
export async function resolveIdentityFromCookies({
  authCookie,
  guestCookie,
  now = new Date(),
  envSource = process.env,
}) {
  const hasAuthCookie =
    typeof authCookie === 'string' && authCookie.trim().length > 0;
  const hasGuestCookie =
    typeof guestCookie === 'string' && guestCookie.trim().length > 0;

  if (!hasAuthCookie && !hasGuestCookie) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  const db = await connectDatabase();
  const authEnv = readAuthEnv(envSource);
  let hadInvalidUserCookie = false;
  let hadInvalidGuestCookie = false;

  if (hasAuthCookie) {
    const claims = verifyJwt(authCookie, authEnv.jwtSecret, {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
      now,
    });

    if (!claims) {
      hadInvalidUserCookie = true;
    } else {
      const sessionObjectId = new ObjectId(claims.sid);
      const userObjectId = new ObjectId(claims.sub);
      const sessionDoc = await db.collection('auth_sessions').findOne({
        _id: sessionObjectId,
        userId: userObjectId,
      });

      const isSessionActive =
        sessionDoc &&
        !sessionDoc.revokedAt &&
        sessionDoc.expiresAt instanceof Date &&
        sessionDoc.expiresAt.getTime() > now.getTime() &&
        sessionDoc.authVersion === claims.authVersion;

      if (!isSessionActive) {
        hadInvalidUserCookie = true;
      } else {
        const userDoc = await db
          .collection('users')
          .findOne({ _id: userObjectId });
        if (!userDoc) {
          hadInvalidUserCookie = true;
        } else if (userDoc.status === 'locked') {
          throw new AppError({
            status: 403,
            code: 'ACCOUNT_LOCKED',
            message: 'Tài khoản của bạn đã bị khóa.',
          });
        } else if (userDoc.authVersion !== claims.authVersion) {
          hadInvalidUserCookie = true;
        } else {
          return {
            kind: /** @type {const} */ ('user'),
            actorKey: `user:${userDoc._id.toHexString()}`,
            userId: userDoc._id,
            sessionId: sessionDoc._id,
            role:
              userDoc.role === 'admin'
                ? /** @type {const} */ ('admin')
                : /** @type {const} */ ('learner'),
            user: userDoc,
          };
        }
      }
    }
  }

  if (hasGuestCookie) {
    const credentialHash = hashGuestCredential(guestCookie);
    const guestDoc = await db
      .collection('guest_sessions')
      .findOne({ credentialHash });

    if (!guestDoc || guestDoc.revokedAt) {
      hadInvalidGuestCookie = true;
    } else {
      const isExpired =
        guestDoc.status === 'expired' ||
        (guestDoc.expiresAt instanceof Date &&
          guestDoc.expiresAt.getTime() <= now.getTime());

      if (isExpired) {
        throw new AppError({
          status: 410,
          code: 'GUEST_EXPIRED',
          message: 'Quyền truy cập tạm của khách đã hết hạn.',
        });
      }

      return {
        kind: /** @type {const} */ ('guest'),
        actorKey: `guest:${guestDoc._id.toHexString()}`,
        guestId: guestDoc._id,
        role: /** @type {const} */ ('guest'),
        guestSession: guestDoc,
      };
    }
  }

  if (hadInvalidUserCookie || hadInvalidGuestCookie) {
    throw new AppError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message:
        'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
    });
  }

  throw new AppError({
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'Vui lòng đăng nhập để tiếp tục.',
  });
}

/**
 * Formats the GET /auth/me response payload from a resolved identity (07 §4).
 *
 * @param {Awaited<ReturnType<typeof resolveIdentityFromCookies>>} identity
 */
export function formatAuthMeDto(identity) {
  if (identity.kind === 'user') {
    return {
      kind: 'user',
      user: toSelfDto(identity.user),
    };
  }

  const guestSession = identity.guestSession;
  /** @type {{ sessionId?: string, expiresAt?: string, status: string }} */
  const guestDto = {
    status: String(guestSession.status ?? 'waiting'),
  };
  if (guestSession.practiceSessionId) {
    guestDto.sessionId =
      typeof guestSession.practiceSessionId.toHexString === 'function'
        ? guestSession.practiceSessionId.toHexString()
        : String(guestSession.practiceSessionId);
  }
  if (guestSession.expiresAt instanceof Date) {
    guestDto.expiresAt = guestSession.expiresAt.toISOString();
  }

  return {
    kind: 'guest',
    guest: guestDto,
  };
}
