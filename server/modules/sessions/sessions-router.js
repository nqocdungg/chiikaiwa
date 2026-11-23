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
import { parsePageLimit } from '../content/content-service.js';
import {
  validateIdempotencyKey,
  validateObjectId,
} from '../invitations/invitation-validation.js';
import { readSession, leaveSession } from './session-service.js';
import { changeScreenShare } from './screen-share-service.js';
import {
  changeSessionCards,
  readCardHints,
  readDeckOptions,
} from './session-card-service.js';

/** @typedef {Parameters<typeof changeSessionCards>[1]} CardCommand */

/** @param {string} path */
function invalid(path) {
  return createValidationError([
    { path, code: 'INVALID_FIELD', message: 'Giá trị không hợp lệ.' },
  ]);
}

/** @param {unknown} value @param {string[]} keys */
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('body');
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) throw invalid(unknown);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} name */
function nonNegativeInteger(value, name) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw invalid(name);
  return value;
}

/** @param {string} kind @param {import('express').Request} request @returns {CardCommand} */
function cardCommand(kind, request) {
  const options = {
    claim: [],
    select: ['deckVersionId'],
    draw: ['slot'],
    propose: ['kind', 'cardId'],
    respond: ['decision'],
  };
  const body = fields(request.body, [
    'expectedVersion',
    ...options[/** @type {keyof typeof options} */ (kind)],
  ]);
  const expectedVersion = nonNegativeInteger(
    body.expectedVersion,
    'expectedVersion',
  );
  switch (kind) {
    case 'claim':
      return { kind, expectedVersion };
    case 'select':
      return {
        kind,
        expectedVersion,
        deckVersionId: validateObjectId(body.deckVersionId, 'deckVersionId'),
      };
    case 'draw':
      return {
        kind,
        expectedVersion,
        slot: nonNegativeInteger(body.slot, 'slot'),
      };
    case 'propose':
      if (
        body.kind !== 'swapRoles' &&
        body.kind !== 'skip' &&
        body.kind !== 'completeAndNext'
      )
        throw invalid('kind');
      return {
        kind,
        expectedVersion,
        actionKind: body.kind,
        cardId: validateObjectId(body.cardId, 'cardId'),
      };
    case 'respond': {
      if (body.decision !== 'accept' && body.decision !== 'reject')
        throw invalid('decision');
      const actionId = request.params.actionId;
      if (
        typeof actionId !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
          actionId,
        )
      )
        throw invalid('actionId');
      return {
        kind,
        expectedVersion,
        actionId: actionId.toLowerCase(),
        decision: body.decision,
      };
    }
    default:
      throw new TypeError('Unknown session card command');
  }
}

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
  const requireMemberIdentity = requireAuth(['U', 'G']);
  for (const action of ['claim', 'release']) {
    router.post(
      `/:id/screen-share/${action}`,
      requireMemberIdentity,
      async (request, response) => {
        const claim = action === 'claim';
        const body = fields(request.body, claim ? ['expectedVersion'] : []);
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        await enforceWriteRateLimit({
          actorOrIpKey: response.locals.identity.actorKey,
        });
        const result = await changeScreenShare({
          sessionId: String(request.params.id),
          getIdentity: currentIdentity(request),
          operationId,
          ...(claim && {
            expectedVersion: nonNegativeInteger(
              body.expectedVersion,
              'expectedVersion',
            ),
          }),
        });
        response.locals.meta.serverTime = result.at.toISOString();
        response
          .status(result.status)
          .json({ data: result.data, meta: response.locals.meta });
      },
    );
  }
  router.get(
    '/:id/deck-options',
    requireMemberIdentity,
    async (request, response) => {
      const query = fields(request.query, ['limit', 'cursor']);
      if (
        query.cursor !== undefined &&
        (typeof query.cursor !== 'string' || query.cursor.length > 512)
      ) {
        throw invalid('cursor');
      }
      const data = await readDeckOptions({
        sessionId: String(request.params.id),
        identity: response.locals.identity,
        limit: parsePageLimit(query.limit),
        cursor: query.cursor,
      });
      response.json({ data, meta: response.locals.meta });
    },
  );
  router.get(
    '/:id/cards/:cardId/hints',
    requireMemberIdentity,
    async (request, response) => {
      const data = await readCardHints({
        sessionId: String(request.params.id),
        cardId: String(request.params.cardId),
        identity: response.locals.identity,
      });
      response.json({ data, meta: response.locals.meta });
    },
  );
  for (const [path, kind] of [
    ['deck-selection', 'select'],
    ['control/claim', 'claim'],
    ['draws', 'draw'],
    ['actions', 'propose'],
    ['actions/:actionId/responses', 'respond'],
  ]) {
    router.post(
      `/:id/${path}`,
      requireMemberIdentity,
      async (request, response) => {
        const command = cardCommand(kind, request);
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        await enforceWriteRateLimit({
          actorOrIpKey: response.locals.identity.actorKey,
        });
        const { data, at } = await changeSessionCards(
          {
            sessionId: String(request.params.id),
            operationId,
            getIdentity: currentIdentity(request),
          },
          command,
        );
        response.locals.meta.serverTime = at.toISOString();
        response.status(kind === 'propose' ? 201 : 200).json({
          data: kind === 'propose' ? { session: data } : data,
          meta: response.locals.meta,
        });
      },
    );
  }
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
