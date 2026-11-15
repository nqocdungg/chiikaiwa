import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  parseCookies,
} from '../../middleware/cookies.js';
import { createValidationError } from '../../middleware/http-error.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import { parsePageLimit } from '../content/content-service.js';
import { resolveIdentityFromCookies } from '../identity/identity-service.js';
import {
  validateIdempotencyKey,
  validateObjectId,
} from '../invitations/invitation-validation.js';
import {
  readSavedItems,
  readSavedSources,
  removeSavedItem,
  upsertSavedItem,
} from './saved-item-service.js';

/** @param {string} path */
function invalid(path) {
  return createValidationError([
    { path, code: 'INVALID_FIELD', message: 'Giá trị không hợp lệ.' },
  ]);
}

/** @param {unknown} value @param {string[]} allowed @param {string} [path] */
function fields(value, allowed, path = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid(path);
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw invalid(unknown);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} path */
function bodyId(value, path) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/iu.test(value))
    throw invalid(path);
  return value.toLowerCase();
}

/** @param {unknown} value */
function saveInput(value) {
  const body = fields(value, [
    'knowledgeVersionId',
    'deckVersionId',
    'sessionId',
    'scenarioVersionId',
  ]);
  const { sessionId, scenarioVersionId } = body;
  if ((sessionId === undefined) !== (scenarioVersionId === undefined)) {
    throw invalid(sessionId === undefined ? 'sessionId' : 'scenarioVersionId');
  }
  return {
    knowledgeVersionId: bodyId(body.knowledgeVersionId, 'knowledgeVersionId'),
    deckVersionId: bodyId(body.deckVersionId, 'deckVersionId'),
    ...(sessionId !== undefined && {
      sessionId: bodyId(sessionId, 'sessionId'),
      scenarioVersionId: bodyId(scenarioVersionId, 'scenarioVersionId'),
    }),
  };
}

/** @param {Record<string, unknown>} query */
function pageInput(query) {
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== 'string' || query.cursor.length > 512)
  ) {
    throw invalid('cursor');
  }
  return { size: parsePageLimit(query.limit), cursor: query.cursor };
}

/** @param {import('express').Request} request @param {import('express').Response} response */
async function writeInput(request, response) {
  const operationId = validateIdempotencyKey(request.get('Idempotency-Key'));
  const identity = response.locals.identity;
  await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
  const cookies = parseCookies(request.headers.cookie);
  return {
    identity,
    operationId,
    getIdentity: () =>
      resolveIdentityFromCookies({
        authCookie: cookies[AUTH_COOKIE_NAME],
        guestCookie: cookies[GUEST_COOKIE_NAME],
      }),
  };
}

export function createSavedItemRouter() {
  const router = Router();
  router.use(requireAuth(['U', 'G']));
  router.get('/', async (request, response) => {
    const query = fields(
      request.query,
      ['limit', 'cursor', 'sessionId'],
      'query',
    );
    const sessionId =
      query.sessionId === undefined
        ? undefined
        : validateObjectId(query.sessionId, 'sessionId');
    const data = await readSavedItems(response.locals.identity, {
      ...pageInput(query),
      sessionId,
    });
    response.json({ data, meta: response.locals.meta });
  });
  router.post('/', async (request, response) => {
    const input = saveInput(request.body);
    const data = await upsertSavedItem(
      await writeInput(request, response),
      input,
    );
    response.json({ data, meta: response.locals.meta });
  });
  router.delete('/:id', async (request, response) => {
    const id = validateObjectId(request.params.id);
    const { expectedVersion } = fields(
      request.query,
      ['expectedVersion'],
      'query',
    );
    if (
      typeof expectedVersion !== 'string' ||
      !/^(0|[1-9]\d*)$/u.test(expectedVersion) ||
      !Number.isSafeInteger(Number(expectedVersion))
    )
      throw invalid('expectedVersion');
    await removeSavedItem(
      await writeInput(request, response),
      id,
      Number(expectedVersion),
    );
    response.status(204).end();
  });
  router.get('/:id/sources', async (request, response) => {
    const query = fields(request.query, ['limit', 'cursor'], 'query');
    const data = await readSavedSources(
      response.locals.identity,
      validateObjectId(request.params.id),
      pageInput(query),
    );
    response.json({ data, meta: response.locals.meta });
  });
  return router;
}
