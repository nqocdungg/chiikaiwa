import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { createValidationError } from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';
import { signReviewTicket } from './review-ticket.js';
import {
  prepareStudyCardReveal,
  queryStudyCards,
  studyCardKeyPattern,
} from './study-card-service.js';
import { resolveStudySet } from './study-scope.js';

const objectIdPattern = /^[a-f0-9]{24}$/u;

/** @param {string} path */
function invalid(path) {
  return createValidationError([
    { path, code: 'INVALID_FIELD', message: 'Giá trị không hợp lệ.' },
  ]);
}

/** @param {unknown} value @param {string[]} fields @param {string} path */
function readObject(value, fields, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  ) {
    throw invalid(path);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @returns {import('./study-card-service.js').StudyScope} */
function readScope(value) {
  const { type, topicVersionId, deckId } = readObject(
    value,
    ['type', 'topicVersionId', 'deckId'],
    'scope',
  );
  if (
    type === 'saved' &&
    topicVersionId === undefined &&
    deckId === undefined
  ) {
    return { type };
  }
  if (
    type === 'topic' &&
    deckId === undefined &&
    typeof topicVersionId === 'string' &&
    objectIdPattern.test(topicVersionId.toLowerCase())
  ) {
    return { type, topicVersionId: topicVersionId.toLowerCase() };
  }
  if (
    type === 'personalDeck' &&
    topicVersionId === undefined &&
    typeof deckId === 'string' &&
    objectIdPattern.test(deckId.toLowerCase())
  ) {
    return { type, deckId: deckId.toLowerCase() };
  }
  throw invalid('scope');
}

export function createStudyCardRouter() {
  const router = Router();
  const auth = requireAuth(['U', 'G']);

  router.post('/query', auth, async (request, response) => {
    const {
      scope: rawScope,
      mode,
      limit,
      cursor,
    } = readObject(request.body, ['scope', 'mode', 'limit', 'cursor'], 'body');
    const scope = readScope(rawScope);
    if (mode !== 'all' && mode !== 'due') throw invalid('mode');
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50)
    )
      throw invalid('limit');
    if (
      cursor !== undefined &&
      (typeof cursor !== 'string' || cursor.length > 512)
    )
      throw invalid('cursor');

    const { identity, meta } = response.locals;
    const db = await connectDatabase();
    const input = await resolveStudySet(
      db,
      identity,
      scope,
      new Date(meta.serverTime),
    );
    const data = await queryStudyCards(db, { ...input, mode, limit, cursor });
    response.json({ data, meta });
  });

  router.post('/reveal', auth, async (request, response) => {
    const { scope: rawScope, cardKey } = readObject(
      request.body,
      ['scope', 'cardKey'],
      'body',
    );
    const scope = readScope(rawScope);
    if (typeof cardKey !== 'string' || !studyCardKeyPattern.test(cardKey)) {
      throw invalid('cardKey');
    }
    const { identity, meta } = response.locals;
    const db = await connectDatabase();
    const input = await resolveStudySet(
      db,
      identity,
      scope,
      new Date(meta.serverTime),
    );
    const { data, ticketClaims } = await prepareStudyCardReveal(db, {
      ...input,
      cardKey,
    });
    response.json({
      data: { ...data, reviewTicket: signReviewTicket(ticketClaims) },
      meta,
    });
  });

  return router;
}
