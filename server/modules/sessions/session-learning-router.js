import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  AUTH_COOKIE_NAME,
  GUEST_COOKIE_NAME,
  parseCookies,
} from '../../middleware/cookies.js';
import {
  AppError,
  createValidationError,
} from '../../middleware/http-error.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import { parsePageLimit } from '../content/content-service.js';
import { resolveIdentityFromCookies } from '../identity/identity-service.js';
import { validateIdempotencyKey } from '../invitations/invitation-validation.js';
import {
  listSessionHistory,
  putSessionNote,
  putSessionSelfAssessment,
  readSessionPersonal,
  readSessionSummary,
  removeSessionNote,
} from './session-learning-service.js';

/** @param {string} path @param {string} [code] */
function invalid(path, code = 'INVALID_FIELD') {
  return createValidationError([
    { path, code, message: 'Giá trị không hợp lệ.' },
  ]);
}

/** @param {unknown} value @param {string[]} allowed @param {string} location */
function objectFields(value, allowed, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid(location, 'INVALID_TYPE');
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw invalid(unknown, 'UNKNOWN_FIELD');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} path @param {boolean} queryValue */
function expectedVersion(value, path = 'expectedVersion', queryValue = false) {
  const normalized =
    queryValue && typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : value;
  if (
    typeof normalized !== 'number' ||
    !Number.isSafeInteger(normalized) ||
    normalized < 0
  )
    throw invalid(path);
  return normalized;
}

/** @param {unknown} value @param {number} maximum @param {string} path */
function limitedString(value, maximum, path) {
  if (typeof value !== 'string' || [...value].length > maximum)
    throw invalid(path);
  return value;
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

/** @param {import('express').Request} request @param {import('express').Response} response */
async function writeContext(request, response) {
  const operationId = validateIdempotencyKey(request.get('Idempotency-Key'));
  await enforceWriteRateLimit({
    actorOrIpKey: response.locals.identity.actorKey,
  });
  return {
    sessionId: String(request.params.id),
    identity: response.locals.identity,
    getIdentity: currentIdentity(request),
    operationId,
  };
}

export function createSessionLearningRouter() {
  const router = express.Router();
  const member = requireAuth(['U', 'G']);

  router.get('/sessions/:id/personal', member, async (request, response) => {
    objectFields(request.query, [], 'query');
    const data = await readSessionPersonal({
      sessionId: String(request.params.id),
      identity: response.locals.identity,
    });
    response.json({ data, meta: response.locals.meta });
  });

  router.put('/sessions/:id/note', member, async (request, response) => {
    const body = objectFields(
      request.body,
      ['expectedVersion', 'note'],
      'body',
    );
    const data = await putSessionNote(await writeContext(request, response), {
      expectedVersion: expectedVersion(body.expectedVersion),
      note: limitedString(body.note, 10_000, 'note'),
    });
    response.json({ data, meta: response.locals.meta });
  });

  router.delete('/sessions/:id/note', member, async (request, response) => {
    const query = objectFields(request.query, ['expectedVersion'], 'query');
    await removeSessionNote(await writeContext(request, response), {
      expectedVersion: expectedVersion(
        query.expectedVersion,
        'expectedVersion',
        true,
      ),
    });
    response.status(204).end();
  });

  router.put(
    '/sessions/:id/self-assessment',
    member,
    async (request, response) => {
      const body = objectFields(
        request.body,
        ['expectedVersion', 'confidence', 'comment'],
        'body',
      );
      if (
        typeof body.confidence !== 'number' ||
        !Number.isSafeInteger(body.confidence) ||
        body.confidence < 1 ||
        body.confidence > 5
      )
        throw invalid('confidence');
      const data = await putSessionSelfAssessment(
        await writeContext(request, response),
        {
          expectedVersion: expectedVersion(body.expectedVersion),
          confidence: body.confidence,
          ...(body.comment !== undefined
            ? { comment: limitedString(body.comment, 1_000, 'comment') }
            : {}),
        },
      );
      response.json({ data, meta: response.locals.meta });
    },
  );

  router.get('/sessions/:id/summary', member, async (request, response) => {
    objectFields(request.query, [], 'query');
    const data = await readSessionSummary({
      sessionId: String(request.params.id),
      identity: response.locals.identity,
    });
    response.json({ data, meta: response.locals.meta });
  });

  router.get('/me/sessions', requireAuth(['U']), async (request, response) => {
    const query = objectFields(request.query, ['limit', 'cursor'], 'query');
    if (
      query.cursor !== undefined &&
      (typeof query.cursor !== 'string' ||
        query.cursor.length === 0 ||
        query.cursor.length > 512)
    )
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ lịch sử không hợp lệ.',
      });
    const data = await listSessionHistory({
      identity: response.locals.identity,
      limit: parsePageLimit(query.limit),
      cursor: query.cursor,
    });
    response.json({ data, meta: response.locals.meta });
  });

  return router;
}
