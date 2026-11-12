import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  parseCookies,
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
} from '../../middleware/cookies.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import { resolveIdentityFromCookies } from '../identity/identity-service.js';
import { validateEmptyObjectInput } from '../identity/validation.js';
import { issueMediaToken } from './media-token-service.js';
import { createValidationError } from '../../middleware/http-error.js';
import { validateIdempotencyKey } from '../invitations/invitation-validation.js';
import { readSession, leaveSession } from './session-service.js';

/** @param {import('express').Request} request */
function currentIdentity(request) {
  const cookies = parseCookies(request.headers.cookie);
  return () =>
    resolveIdentityFromCookies({
      authCookie: cookies[AUTH_COOKIE_NAME],
      guestCookie: cookies[GUEST_COOKIE_NAME],
    });
}

export function createSessionsRouter() {
  const router = express.Router();
  router.get(
    '/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const result = await readSession({
          sessionId: String(request.params.id),
          getIdentity: currentIdentity(request),
        });
        response.locals.meta.serverTime = result.at.toISOString();
        response.json({ data: result.data, meta: response.locals.meta });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/leave',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        validateEmptyObjectInput(request.body);
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        await enforceWriteRateLimit({
          actorOrIpKey: response.locals.identity.actorKey,
        });
        const result = await leaveSession({
          sessionId: String(request.params.id),
          getIdentity: currentIdentity(request),
          operationId,
        });
        response.locals.meta.serverTime = result.at.toISOString();
        response.json({ data: result.data, meta: response.locals.meta });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/media-token',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        validateEmptyObjectInput(request.body);
        // Khóa phải có dạng UUID; kiểm tra định dạng không thay thế kiểm tra quyền.
        const operationId = request.get('Idempotency-Key');
        if (
          !operationId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            operationId,
          )
        ) {
          throw createValidationError([
            {
              path: 'Idempotency-Key',
              code: 'INVALID_UUID',
              message: 'Idempotency-Key phải là UUID.',
            },
          ]);
        }
        await enforceWriteRateLimit({
          actorOrIpKey: response.locals.identity.actorKey,
        });
        const cookies = parseCookies(request.headers.cookie);
        const data = await issueMediaToken({
          sessionId: String(request.params.id),
          operationId: operationId.toLowerCase(),
          getIdentity: () =>
            resolveIdentityFromCookies({
              authCookie: cookies[AUTH_COOKIE_NAME],
              guestCookie: cookies[GUEST_COOKIE_NAME],
            }),
        });
        response.json({ data, meta: response.locals.meta });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
