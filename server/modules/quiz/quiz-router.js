import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import {
  validateIdempotencyKey,
  validateObjectId,
} from '../invitations/invitation-validation.js';
import {
  createQuiz,
  getQuiz,
  listQuizzes,
  submitQuiz,
} from './quiz-service.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate input cho POST /quizzes.
 *
 * @param {unknown} body
 */
function validateCreateQuizInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError('Dữ liệu yêu cầu không hợp lệ.');
  }

  const allowedFields = new Set(['deckVersionId', 'sourceSessionId']);
  const unknownFields = Object.keys(body).filter(
    (key) => !allowedFields.has(key),
  );
  if (unknownFields.length > 0) {
    throw createValidationError(
      unknownFields.map((field) => ({
        path: field,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${field}" không được phép trong yêu cầu này.`,
      })),
    );
  }

  const errors = [];
  if (!body.deckVersionId || typeof body.deckVersionId !== 'string') {
    errors.push({
      path: 'deckVersionId',
      code: 'REQUIRED_FIELD',
      message: 'deckVersionId là bắt buộc.',
    });
  } else if (!/^[0-9a-f]{24}$/iu.test(body.deckVersionId)) {
    errors.push({
      path: 'deckVersionId',
      code: 'INVALID_FIELD',
      message: 'deckVersionId không hợp lệ.',
    });
  }

  if (body.sourceSessionId !== undefined) {
    if (
      typeof body.sourceSessionId !== 'string' ||
      !/^[0-9a-f]{24}$/iu.test(body.sourceSessionId)
    ) {
      errors.push({
        path: 'sourceSessionId',
        code: 'INVALID_FIELD',
        message: 'sourceSessionId không hợp lệ.',
      });
    }
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  const sourceSessionId =
    typeof body.sourceSessionId === 'string'
      ? String(body.sourceSessionId).toLowerCase()
      : undefined;

  return {
    deckVersionId: String(body.deckVersionId).toLowerCase(),
    sourceSessionId,
  };
}

/**
 * Validate input cho POST /quizzes/:id/submission.
 *
 * @param {unknown} body
 */
function validateSubmissionInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError('Dữ liệu nộp bài không hợp lệ.');
  }

  const allowedFields = new Set(['expectedVersion', 'answers']);
  const unknownFields = Object.keys(body).filter(
    (key) => !allowedFields.has(key),
  );
  if (unknownFields.length > 0) {
    throw createValidationError(
      unknownFields.map((field) => ({
        path: field,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${field}" không được phép trong yêu cầu này.`,
      })),
    );
  }

  const errors = [];
  const expectedVersion = /** @type {number} */ (body.expectedVersion);
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    errors.push({
      path: 'expectedVersion',
      code: 'INVALID_FIELD',
      message: 'expectedVersion phải là số nguyên không âm.',
    });
  }

  if (!Array.isArray(body.answers)) {
    errors.push({
      path: 'answers',
      code: 'INVALID_FIELD',
      message: 'answers phải là một mảng câu trả lời.',
    });
  } else if (body.answers.length > 5) {
    errors.push({
      path: 'answers',
      code: 'INVALID_FIELD',
      message: 'answers không được vượt quá 5 câu hỏi.',
    });
  } else {
    for (let i = 0; i < body.answers.length; i++) {
      const item = body.answers[i];
      if (!isPlainObject(item)) {
        errors.push({
          path: `answers[${i}]`,
          code: 'INVALID_FIELD',
          message: 'Mỗi câu trả lời phải là một object.',
        });
        continue;
      }
      const itemKeys = Object.keys(item).filter(
        (k) => !['questionVersionId', 'optionId', 'text'].includes(k),
      );
      if (itemKeys.length > 0) {
        for (const k of itemKeys) {
          errors.push({
            path: `answers[${i}].${k}`,
            code: 'UNKNOWN_FIELD',
            message: `Trường "${k}" không được phép trong câu trả lời.`,
          });
        }
      }
      if (
        !item.questionVersionId ||
        typeof item.questionVersionId !== 'string' ||
        !/^[0-9a-f]{24}$/iu.test(item.questionVersionId)
      ) {
        errors.push({
          path: `answers[${i}].questionVersionId`,
          code: 'INVALID_FIELD',
          message: 'questionVersionId không hợp lệ.',
        });
      }
      if (item.optionId !== undefined) {
        if (typeof item.optionId !== 'string') {
          errors.push({
            path: `answers[${i}].optionId`,
            code: 'INVALID_FIELD',
            message: 'optionId phải là chuỗi ký tự.',
          });
        } else if (item.optionId.length > 64) {
          errors.push({
            path: `answers[${i}].optionId`,
            code: 'INVALID_FIELD',
            message: 'optionId không được vượt quá 64 ký tự.',
          });
        }
      }
      if (item.text !== undefined) {
        if (typeof item.text !== 'string') {
          errors.push({
            path: `answers[${i}].text`,
            code: 'INVALID_FIELD',
            message: 'text phải là chuỗi ký tự.',
          });
        } else if ([...item.text].length > 500) {
          errors.push({
            path: `answers[${i}].text`,
            code: 'INVALID_FIELD',
            message: 'text không được vượt quá 500 ký tự.',
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  const rawAnswers = Array.isArray(body.answers) ? body.answers : [];

  return {
    expectedVersion,
    answers: rawAnswers.map((/** @type {Record<string, any>} */ ans) => ({
      questionVersionId: String(ans.questionVersionId).toLowerCase(),
      ...(ans.optionId !== undefined && { optionId: String(ans.optionId) }),
      ...(ans.text !== undefined && { text: String(ans.text) }),
    })),
  };
}

export function createQuizRouter() {
  const router = Router();
  const auth = requireAuth(['U', 'G']);

  // POST /api/v1/quizzes
  router.post('/quizzes', auth, async (request, response) => {
    const identity = response.locals.identity;
    await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
    const idempotencyKey = validateIdempotencyKey(
      request.get('Idempotency-Key'),
    );
    const input = validateCreateQuizInput(request.body);
    const data = await createQuiz({
      identity,
      deckVersionId: input.deckVersionId,
      sourceSessionId: input.sourceSessionId,
      idempotencyKey,
    });
    response
      .status(201)
      .set('Location', `/api/v1/quizzes/${data.id}`)
      .json({ data, meta: response.locals.meta });
  });

  // GET /api/v1/quizzes/:id
  router.get('/quizzes/:id', auth, async (request, response) => {
    const identity = response.locals.identity;
    const id = validateObjectId(request.params.id, 'id');
    const data = await getQuiz({ identity, id });
    response.json({ data, meta: response.locals.meta });
  });

  // POST /api/v1/quizzes/:id/submission
  router.post('/quizzes/:id/submission', auth, async (request, response) => {
    const identity = response.locals.identity;
    await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
    const id = validateObjectId(request.params.id, 'id');
    const idempotencyKey = validateIdempotencyKey(
      request.get('Idempotency-Key'),
    );

    const { expectedVersion, answers } = validateSubmissionInput(request.body);
    const data = await submitQuiz({
      identity,
      id,
      expectedVersion,
      answers,
      idempotencyKey,
    });
    response.json({ data, meta: response.locals.meta });
  });

  // GET /api/v1/me/quizzes
  router.get('/me/quizzes', auth, async (request, response) => {
    const identity = response.locals.identity;
    const query = request.query;

    const allowedQueryKeys = new Set(['sourceSessionId', 'limit', 'cursor']);
    for (const key of Object.keys(query)) {
      if (!allowedQueryKeys.has(key)) {
        throw createValidationError([
          {
            path: key,
            code: 'UNKNOWN_FIELD',
            message: `Tham số truy vấn '${key}' không được hỗ trợ.`,
          },
        ]);
      }
    }

    let sourceSessionId;
    if (query.sourceSessionId !== undefined) {
      sourceSessionId = validateObjectId(
        query.sourceSessionId,
        'sourceSessionId',
      );
    }

    let limit;
    if (query.limit !== undefined) {
      const rawLimit = String(query.limit);
      if (!/^[1-9]\d*$/.test(rawLimit)) {
        throw createValidationError([
          {
            path: 'limit',
            code: 'INVALID_FIELD',
            message: 'limit phải là số nguyên từ 1 đến 50.',
          },
        ]);
      }
      const parsed = Number(rawLimit);
      if (parsed > 50) {
        throw createValidationError([
          {
            path: 'limit',
            code: 'INVALID_FIELD',
            message: 'limit phải là số nguyên từ 1 đến 50.',
          },
        ]);
      }
      limit = parsed;
    }

    let cursor;
    if (query.cursor !== undefined) {
      if (typeof query.cursor !== 'string' || query.cursor.length > 512) {
        throw createValidationError([
          {
            path: 'cursor',
            code: 'INVALID_FIELD',
            message: 'cursor không hợp lệ.',
          },
        ]);
      }
      cursor = query.cursor;
    }

    const data = await listQuizzes({
      identity,
      sourceSessionId,
      limit,
      cursor,
    });
    response.json({ data, meta: response.locals.meta });
  });

  return router;
}
