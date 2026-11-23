import express from 'express';
import { readAuthEnv } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/http-error.js';
import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  parseCookies,
  setGuestSessionCookie,
} from '../../middleware/cookies.js';
import {
  consumeRateLimit,
  enforceWriteRateLimit,
  getClientIp,
} from '../../middleware/rate-limit.js';
import { connectDatabase } from '../../persistence/database.js';
import {
  cancelInvitation,
  cancelInviteRequest,
  createGuestTrial,
  createInvitation,
  createInviteRequest,
  getInvitation,
  getInviteRequest,
  INVITATION_CODE_LOOKUP_MAX,
  INVITATION_CODE_LOOKUP_WINDOW_MS,
  listInviteRequests,
  respondToInviteRequest,
} from './invitation-service.js';
import {
  validateCreateGuestTrialInput,
  validateCreateInvitationInput,
  validateCreateInviteRequestInput,
  validateExpectedVersion,
  validateIdempotencyKey,
  validateInviteRequestListQuery,
  validateInviteResponseInput,
  validateObjectId,
} from './invitation-validation.js';

/** @param {import('express').Request} request */
function operationId(request) {
  return validateIdempotencyKey(request.get('Idempotency-Key'));
}

/** @param {import('express').Request} request */
function queryVersion(request) {
  const value = request.query.expectedVersion;
  const parsed =
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  return validateExpectedVersion(parsed);
}

/** @param {import('express').Request} request @param {import('express').Response} response */
async function applyWriteLimit(request, response) {
  const actorKey = response.locals.identity?.actorKey;
  await enforceWriteRateLimit({
    actorOrIpKey: actorKey ?? `ip:${getClientIp(request)}`,
  });
}

/**
 * @param {{assertPairCanEnterSession?: (input: any) => Promise<void>}} [options]
 */
export function createInvitationRouter({ assertPairCanEnterSession } = {}) {
  const router = express.Router();

  // POST /api/v1/guest-trials (P) — public browser mutation with CSRF.
  router.post('/guest-trials', async (request, response, next) => {
    try {
      const cookies = parseCookies(request.headers.cookie);
      if (cookies[AUTH_COOKIE_NAME] !== undefined) {
        throw new AppError({
          status: 409,
          code: 'IDENTITY_CONFLICT',
          message:
            'Không thể tạo lượt thử khách khi đang mang phiên tài khoản.',
        });
      }
      const { code } = validateCreateGuestTrialInput(request.body);
      const operation = operationId(request);
      await applyWriteLimit(request, response);
      const db = await connectDatabase();
      await consumeRateLimit({
        db,
        scope: 'invitation-code-ip',
        subjectKey: getClientIp(request),
        limit: INVITATION_CODE_LOOKUP_MAX,
        windowMs: INVITATION_CODE_LOOKUP_WINDOW_MS,
      });
      const result = await createGuestTrial({
        code,
        operationId: operation,
        existingGuestCredential: cookies[GUEST_COOKIE_NAME],
      });
      if (result.credentialToSet) {
        setGuestSessionCookie(response, result.credentialToSet, {
          secure: readAuthEnv().secureCookies,
        });
      }
      response
        .status(201)
        .json({ data: result.data, meta: response.locals.meta });
    } catch (caught) {
      next(caught);
    }
  });

  router.post(
    '/invitations',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        validateCreateInvitationInput(request.body);
        await applyWriteLimit(request, response);
        const data = await createInvitation({
          identity: response.locals.identity,
          operationId: operationId(request),
        });
        response.status(201).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.get(
    '/invitations/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const data = await getInvitation({
          invitationId: validateObjectId(request.params.id, 'invitationId'),
          actorKey: response.locals.identity.actorKey,
        });
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.delete(
    '/invitations/:id',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        await applyWriteLimit(request, response);
        await cancelInvitation({
          invitationId: validateObjectId(request.params.id, 'invitationId'),
          actorKey: response.locals.identity.actorKey,
          expectedVersion: queryVersion(request),
          operationId: operationId(request),
        });
        response.status(204).end();
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.post(
    '/invitation-requests',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        const { code } = validateCreateInviteRequestInput(request.body);
        await applyWriteLimit(request, response);
        const db = await connectDatabase();
        await consumeRateLimit({
          db,
          scope: 'invitation-code-ip',
          subjectKey: getClientIp(request),
          limit: INVITATION_CODE_LOOKUP_MAX,
          windowMs: INVITATION_CODE_LOOKUP_WINDOW_MS,
        });
        const data = await createInviteRequest({
          identity: response.locals.identity,
          code,
          operationId: operationId(request),
        });
        response.status(201).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.get(
    '/invitation-requests/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const data = await getInviteRequest({
          requestId: validateObjectId(request.params.id, 'requestId'),
          actorKey: response.locals.identity.actorKey,
        });
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.get(
    '/invitations/:id/requests',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        const query = validateInviteRequestListQuery(request.query);
        const data = await listInviteRequests({
          invitationId: validateObjectId(request.params.id, 'invitationId'),
          actorKey: response.locals.identity.actorKey,
          ...query,
        });
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.post(
    '/invitation-requests/:id/responses',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        const input = validateInviteResponseInput(request.body);
        await applyWriteLimit(request, response);
        const data = await respondToInviteRequest({
          requestId: validateObjectId(request.params.id, 'requestId'),
          hostKey: response.locals.identity.actorKey,
          operationId: operationId(request),
          assertPairCanEnterSession,
          ...input,
        });
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  router.delete(
    '/invitation-requests/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        await applyWriteLimit(request, response);
        await cancelInviteRequest({
          requestId: validateObjectId(request.params.id, 'requestId'),
          actorKey: response.locals.identity.actorKey,
          expectedVersion: queryVersion(request),
          operationId: operationId(request),
        });
        response.status(204).end();
      } catch (caught) {
        next(caught);
      }
    },
  );

  return router;
}
