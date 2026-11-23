import { createHash } from 'node:crypto';
import {
  AppError,
  createValidationError,
} from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  findContentVersionById,
  findContentVersionsByIds,
} from '../content/content-repository.js';
import { assertDeckVersionSourceAccess } from '../content/content-service.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { guestAccess } from '../learning/guest-write-guard.js';
import {
  createQuizAttempt,
  findQuizAttemptById,
  findQuizAttemptByIdAndOwner,
  incrementSubmittedQuizCount,
  listQuizAttempts,
  submitQuizAttemptCas,
  toObjectId,
} from './quiz-repository.js';

/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */

/**
 * Kiểm tra câu hỏi có hợp lệ và đủ điều kiện để chấm điểm hay không (B4).
 *
 * @param {Record<string, any>} q
 * @returns {boolean}
 */
export function isGradableQuestion(q) {
  const p = q.payload ?? {};
  if (typeof p.prompt !== 'string' || !p.prompt.trim()) return false;
  if (typeof p.explanation !== 'string' || !p.explanation.trim()) return false;
  if (p.type === 'multipleChoice') {
    const ids = Array.isArray(p.options)
      ? p.options.map((/** @type {any} */ o) => o?.id)
      : [];
    return (
      ids.length >= 2 &&
      new Set(ids).size === ids.length &&
      ids.every(
        (/** @type {any} */ id) => typeof id === 'string' && Boolean(id),
      ) &&
      ids.includes(p.correctOptionId) &&
      p.options.every(
        (/** @type {any} */ o) =>
          typeof o?.text === 'string' && Boolean(o.text.trim()),
      )
    );
  }
  if (p.type === 'shortAnswer') {
    return (
      Array.isArray(p.acceptedAnswers) &&
      p.acceptedAnswers.length > 0 &&
      p.acceptedAnswers.every(
        (/** @type {any} */ a) =>
          typeof a === 'string' && a.trim() === a && a !== '',
      )
    );
  }
  return false;
}

/**
 * Hash normalized answers for idempotent submit replay checking.
 *
 * @param {Array<{ questionVersionId: string | import('mongoose').Types.ObjectId, optionId?: string, text?: string }>} [answers]
 * @returns {string}
 */
export function hashAnswers(answers = []) {
  const normalized = (answers || [])
    .map((a) => {
      const hasOptionId = a.optionId !== undefined && a.optionId !== null;
      const hasText = a.text !== undefined && a.text !== null;
      return {
        questionVersionId: String(a.questionVersionId).toLowerCase(),
        hasOptionId,
        optionId: hasOptionId ? String(a.optionId) : null,
        hasText,
        text: hasText && typeof a.text === 'string' ? a.text.trim() : null,
      };
    })
    .sort((a, b) => a.questionVersionId.localeCompare(b.questionVersionId));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Xử lý khi attempt đã ở trạng thái submitted (B3).
 *
 * @param {Record<string, any>} attempt
 * @param {string} payloadHash
 * @param {string} [idempotencyKey]
 */
export function resolveAlreadySubmitted(attempt, payloadHash, idempotencyKey) {
  if (attempt.submitPayloadHash === payloadHash) {
    return toQuizResultDto(attempt);
  }
  if (idempotencyKey && attempt.submitOperationId === idempotencyKey) {
    throw new AppError({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency-Key đã dùng với nội dung khác.',
    });
  }
  throw new AppError({
    status: 409,
    code: 'QUIZ_ALREADY_SUBMITTED',
    message: 'Lượt quiz đã được nộp trước đó với câu trả lời khác.',
  });
}

/**
 * Chấm điểm danh sách câu trả lời theo snapshot câu hỏi (BR-22).
 *
 * @param {Array<Record<string, any>>} snapshotQuestions
 * @param {Array<{ questionVersionId: string | import('mongoose').Types.ObjectId, optionId?: string, text?: string }>} [submittedAnswers]
 */
export function gradeQuizAnswers(snapshotQuestions, submittedAnswers = []) {
  const answersMap = new Map();
  for (const ans of submittedAnswers || []) {
    const key = String(ans.questionVersionId);
    answersMap.set(key, ans);
  }

  let totalScore = 0;
  const results = [];
  const recordedAnswers = [];

  for (const q of snapshotQuestions) {
    const qKey = String(q.questionVersionId);
    const ans = answersMap.get(qKey);

    let isCorrect = false;
    let recordedOptionId;
    let recordedText;

    if (q.type === 'multipleChoice') {
      if (ans && typeof ans.optionId === 'string' && ans.text === undefined) {
        recordedOptionId = ans.optionId;
        isCorrect = ans.optionId === q.correctOptionId;
      }
    } else if (q.type === 'shortAnswer') {
      if (ans && typeof ans.text === 'string' && ans.optionId === undefined) {
        recordedText = ans.text;
        const trimmed = ans.text.trim();
        const accepted = Array.isArray(q.acceptedAnswers)
          ? q.acceptedAnswers
          : [];
        isCorrect = accepted.includes(trimmed);
      }
    }

    const points = isCorrect ? 1 : 0;
    totalScore += points;

    results.push({
      questionVersionId: q.questionVersionId,
      isCorrect,
      points,
    });

    if (ans) {
      recordedAnswers.push({
        questionVersionId: q.questionVersionId,
        ...(recordedOptionId !== undefined && { optionId: recordedOptionId }),
        ...(recordedText !== undefined && { text: recordedText }),
      });
    }
  }

  return {
    score: totalScore,
    results,
    answers: recordedAnswers,
  };
}

/**
 * Projection an toàn trước khi nộp (QuizPublic): không chứa đáp án chuẩn hay giải thích.
 *
 * @param {Record<string, any>} attempt
 */
export function toQuizPublicDto(attempt) {
  return {
    id: attempt._id.toHexString
      ? attempt._id.toHexString()
      : String(attempt._id),
    deckVersionId: attempt.deckVersionId.toHexString
      ? attempt.deckVersionId.toHexString()
      : String(attempt.deckVersionId),
    ...(attempt.sourceSessionId && {
      sourceSessionId: attempt.sourceSessionId.toHexString
        ? attempt.sourceSessionId.toHexString()
        : String(attempt.sourceSessionId),
    }),
    status: attempt.status,
    total: attempt.total,
    version: attempt.version ?? 0,
    questions: attempt.questions.map((/** @type {any} */ q) => ({
      questionVersionId: q.questionVersionId.toHexString
        ? q.questionVersionId.toHexString()
        : String(q.questionVersionId),
      type: q.type,
      prompt: q.prompt,
      ...(Array.isArray(q.options) &&
        q.options.length > 0 && {
          options: q.options.map((/** @type {any} */ opt) => ({
            id: opt.id,
            text: opt.text,
          })),
        }),
    })),
  };
}

/**
 * Projection sau khi đã nộp (QuizResult): đầy đủ điểm, kết quả và giải thích (07 §3).
 *
 * @param {Record<string, any>} attempt
 */
export function toQuizResultDto(attempt) {
  const resultsMap = new Map();
  for (const r of attempt.results || []) {
    resultsMap.set(String(r.questionVersionId), r);
  }

  return {
    id: attempt._id.toHexString
      ? attempt._id.toHexString()
      : String(attempt._id),
    deckVersionId: attempt.deckVersionId.toHexString
      ? attempt.deckVersionId.toHexString()
      : String(attempt.deckVersionId),
    ...(attempt.sourceSessionId && {
      sourceSessionId: attempt.sourceSessionId.toHexString
        ? attempt.sourceSessionId.toHexString()
        : String(attempt.sourceSessionId),
    }),
    status: attempt.status,
    total: attempt.total,
    version: attempt.version ?? 0,
    questions: attempt.questions.map((/** @type {any} */ q) => ({
      questionVersionId: q.questionVersionId.toHexString
        ? q.questionVersionId.toHexString()
        : String(q.questionVersionId),
      type: q.type,
      prompt: q.prompt,
      ...(Array.isArray(q.options) &&
        q.options.length > 0 && {
          options: q.options.map((/** @type {any} */ opt) => ({
            id: opt.id,
            text: opt.text,
          })),
        }),
    })),
    answers: (attempt.answers || []).map((/** @type {any} */ a) => ({
      questionVersionId: a.questionVersionId.toHexString
        ? a.questionVersionId.toHexString()
        : String(a.questionVersionId),
      ...(a.optionId !== undefined && { optionId: a.optionId }),
      ...(a.text !== undefined && { text: a.text }),
    })),
    score: attempt.score ?? 0,
    submittedAt:
      attempt.submittedAt instanceof Date
        ? attempt.submittedAt.toISOString()
        : attempt.submittedAt
          ? new Date(attempt.submittedAt).toISOString()
          : undefined,
    results: attempt.questions.map((/** @type {any} */ q) => {
      const qKey = String(q.questionVersionId);
      const res = resultsMap.get(qKey);
      return {
        questionVersionId: q.questionVersionId.toHexString
          ? q.questionVersionId.toHexString()
          : String(q.questionVersionId),
        isCorrect: res ? Boolean(res.isCorrect) : false,
        points: res ? res.points : 0,
        ...(q.type === 'multipleChoice' &&
          q.correctOptionId && {
            correctOptionId: q.correctOptionId,
          }),
        ...(q.type === 'shortAnswer' &&
          Array.isArray(q.acceptedAnswers) && {
            acceptedAnswers: q.acceptedAnswers,
          }),
        explanation: q.explanation,
        knowledgeVersionIds: (q.knowledgeVersionIds || []).map(
          (/** @type {any} */ k) =>
            k.toHexString ? k.toHexString() : String(k),
        ),
      };
    }),
  };
}

/**
 * Xáo trộn ngẫu nhiên mảng câu hỏi (Fisher-Yates shuffle).
 *
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Tạo một lượt quiz mới từ deckVersionId (FR-QIZ-01, BR-21, 07 §2.2, Must fix 1).
 *
 * @param {Object} params
 * @param {Identity} params.identity
 * @param {string} params.deckVersionId
 * @param {string} [params.sourceSessionId]
 * @param {string} params.idempotencyKey
 * @returns {Promise<any>}
 */
export async function createQuiz({
  identity,
  deckVersionId,
  sourceSessionId,
  idempotencyKey,
}) {
  const db = await connectDatabase();
  const ownerKey = identity.actorKey;
  const deckOid = toObjectId(deckVersionId);

  /** @type {Awaited<ReturnType<typeof guestAccess>>} */
  let guestGuard = null;

  return runIdempotentOperation({
    actorKey: ownerKey,
    method: 'POST',
    path: '/api/v1/quizzes',
    operationId: idempotencyKey,
    payload: {
      deckVersionId: String(deckVersionId).toLowerCase(),
      sourceSessionId: sourceSessionId
        ? String(sourceSessionId).toLowerCase()
        : null,
    },
    authorize: async ({ session, replay }) => {
      guestGuard = await guestAccess(db, identity, session, !replay);
    },
    execute: async ({ session }) => {
      if (guestGuard && String(guestGuard.deckVersionId) !== String(deckOid)) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Bộ chủ đề không thuộc phạm vi lượt thử của khách.',
        });
      }

      const deckVersion = await findContentVersionById(db, deckOid, {
        session,
      });
      if (!deckVersion || deckVersion.kind !== 'deck') {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy phiên bản bộ chủ đề '${deckVersionId}'.`,
        });
      }

      const parentItem = await db.collection('content_items').findOne(
        {
          _id: deckVersion.contentId,
          kind: 'deck',
        },
        { session },
      );
      if (!parentItem) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy chủ đề cha của phiên bản '${deckVersionId}'.`,
        });
      }

      try {
        await assertDeckVersionSourceAccess(db, {
          identity,
          deckVersionId: deckOid,
          parentItem,
          session,
          allowAdmin: false,
        });
      } catch (err) {
        if (err instanceof AppError && err.code === 'FORBIDDEN') {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Tài nguyên không tồn tại hoặc ngoài phạm vi truy cập.',
          });
        }
        throw err;
      }

      let sourceSessionOid;
      if (sourceSessionId) {
        sourceSessionOid = toObjectId(sourceSessionId);
        const sessionDoc = await db.collection('practice_sessions').findOne(
          {
            _id: sourceSessionOid,
            'members.actorKey': ownerKey,
          },
          { session },
        );
        if (!sessionDoc) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: `Không tìm thấy phiên thực hành '${sourceSessionId}'.`,
          });
        }
        if (
          !sessionDoc.deckVersionId ||
          String(sessionDoc.deckVersionId) !== String(deckOid)
        ) {
          throw createValidationError([
            {
              path: 'sourceSessionId',
              code: 'INVALID_FIELD',
              message: 'Bộ chủ đề không khớp với phiên thực hành.',
            },
          ]);
        }
        if (sessionDoc.status !== 'ended') {
          throw createValidationError([
            {
              path: 'sourceSessionId',
              code: 'INVALID_FIELD',
              message: 'Phiên thực hành phải ở trạng thái đã kết thúc.',
            },
          ]);
        }
      }

      const questionVersionIds = deckVersion.payload?.questionVersionIds || [];
      if (questionVersionIds.length === 0) {
        throw new AppError({
          status: 409,
          code: 'QUIZ_UNAVAILABLE',
          message: 'Chưa có câu hỏi quiz cho bộ chủ đề này.',
        });
      }

      const questionDocs = await findContentVersionsByIds(
        db,
        questionVersionIds,
        { session },
      );
      const order = new Map(
        questionVersionIds.map(
          (/** @type {any} */ id, /** @type {number} */ i) => [String(id), i],
        ),
      );
      const orderedDocs = [...questionDocs].sort(
        (a, b) =>
          (order.get(String(a._id)) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(String(b._id)) ?? Number.MAX_SAFE_INTEGER),
      );

      const seenContentIds = new Set();
      const validQuestions = orderedDocs
        .filter((doc) => doc.kind === 'question' && isGradableQuestion(doc))
        .filter((doc) => {
          const k = String(doc.contentId);
          if (seenContentIds.has(k)) return false;
          seenContentIds.add(k);
          return true;
        });

      if (validQuestions.length === 0) {
        throw new AppError({
          status: 409,
          code: 'QUIZ_UNAVAILABLE',
          message: 'Chưa có câu hỏi quiz khả dụng cho bộ chủ đề này.',
        });
      }

      const selectedQuestions =
        validQuestions.length <= 5
          ? validQuestions
          : shuffleArray(validQuestions).slice(0, 5);

      const snapshotQuestions = selectedQuestions.map((q) => {
        const payload = q.payload || {};
        return {
          questionVersionId: q._id,
          type: payload.type,
          prompt: payload.prompt,
          options: Array.isArray(payload.options) ? payload.options : [],
          correctOptionId: payload.correctOptionId,
          acceptedAnswers: Array.isArray(payload.acceptedAnswers)
            ? payload.acceptedAnswers
            : [],
          explanation: payload.explanation || '',
          knowledgeVersionIds: Array.isArray(payload.knowledgeVersionIds)
            ? payload.knowledgeVersionIds
            : [],
        };
      });

      const purgeAt = guestGuard?.purgeAt;

      const attemptDoc = {
        ownerKey,
        deckVersionId: deckOid,
        ...(sourceSessionOid && { sourceSessionId: sourceSessionOid }),
        status: 'inProgress',
        questions: snapshotQuestions,
        total: snapshotQuestions.length,
        version: 0,
        ...(purgeAt && { purgeAt }),
      };

      const created = await createQuizAttempt(attemptDoc, { session });
      return {
        resultRef: String(created._id),
        value: toQuizPublicDto(created),
      };
    },
    replay: async ({ session, receipt }) => {
      if (!receipt.resultRef) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy lượt quiz đã tạo.',
        });
      }
      const attempt = await findQuizAttemptByIdAndOwner(
        receipt.resultRef,
        identity.actorKey,
        { session },
      );
      if (!attempt) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy lượt quiz đã tạo.',
        });
      }
      return toQuizPublicDto(attempt);
    },
  });
}

/**
 * Đọc lượt quiz theo ID và actorKey (07 §9.2, B5, B6).
 *
 * @param {Object} params
 * @param {Identity} params.identity
 * @param {string} params.id
 */
export async function getQuiz({ identity, id }) {
  const db = await connectDatabase();
  await guestAccess(db, identity, null, false);
  const attempt = await findQuizAttemptByIdAndOwner(id, identity.actorKey);
  if (!attempt) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy lượt quiz '${id}'.`,
    });
  }

  if (attempt.status === 'submitted') {
    return toQuizResultDto(attempt);
  }
  return toQuizPublicDto(attempt);
}

/**
 * Nộp bài chấm điểm quiz (FR-QIZ-03, BR-22, TX-10, Must fix 3).
 *
 * @param {Object} params
 * @param {Identity} params.identity
 * @param {string} params.id
 * @param {number} params.expectedVersion
 * @param {Array<{ questionVersionId: string, optionId?: string, text?: string }>} params.answers
 * @param {string} params.idempotencyKey
 */
export async function submitQuiz({
  identity,
  id,
  expectedVersion,
  answers = [],
  idempotencyKey,
}) {
  const db = await connectDatabase();
  const answersHash = hashAnswers(answers);
  const payloadHash = createHash('sha256')
    .update(JSON.stringify([expectedVersion, answersHash]))
    .digest('hex');

  /** @param {{ submitPayloadHash?: string | null, version: number }} attempt */
  function matchesSubmission(attempt) {
    // Older records hashed only answers. The submit CAS incremented version once.
    return (
      attempt.submitPayloadHash === payloadHash ||
      (attempt.version === expectedVersion + 1 &&
        attempt.submitPayloadHash === answersHash)
    );
  }

  const submittedAttempt = await withTransaction(async (session) => {
    // 1. Đọc attempt trong transaction trước
    const attempt = await findQuizAttemptByIdAndOwner(id, identity.actorKey, {
      session,
    });
    if (!attempt) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Không tìm thấy lượt quiz '${id}'.`,
      });
    }

    // 2. Xử lý nộp lại / Idempotency replay (07 §9.2, B3, 06 §11.3)
    if (attempt.status === 'submitted') {
      // Replay không ghi học tập: chỉ đọc guestAccess (write = false), không tăng version nhưng vẫn chặn 410 nếu hết hạn
      await guestAccess(db, identity, session, false);
      if (matchesSubmission(attempt)) {
        return attempt;
      }
      if (idempotencyKey && attempt.submitOperationId === idempotencyKey) {
        throw new AppError({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency-Key đã dùng với nội dung khác.',
        });
      }
      throw new AppError({
        status: 409,
        code: 'QUIZ_ALREADY_SUBMITTED',
        message: 'Lượt quiz đã được nộp trước đó với câu trả lời khác.',
      });
    }

    // 3. Với lượt chưa nộp: Kiểm tra quyền khách và CAS tăng guest_sessions.version trong transaction (06 §11.2)
    await guestAccess(db, identity, session, true);

    // 4. Kiểm tra Optimistic Concurrency Control với details.currentVersion
    if (attempt.version !== expectedVersion) {
      throw new AppError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Phiên bản không khớp (VERSION_CONFLICT).',
        details: { currentVersion: attempt.version },
      });
    }

    // 5. Validate danh sách câu trả lời theo snapshot (B2)
    const validationErrors = [];
    const snapshotQuestionsMap = new Map();
    for (const q of attempt.questions) {
      snapshotQuestionsMap.set(String(q.questionVersionId), q);
    }

    const seenQuestions = new Set();
    for (let i = 0; i < answers.length; i++) {
      const ans = answers[i];
      const qId = String(ans.questionVersionId);
      if (!snapshotQuestionsMap.has(qId)) {
        validationErrors.push({
          path: `answers[${i}].questionVersionId`,
          code: 'UNKNOWN_FIELD',
          message: `Câu hỏi '${qId}' không thuộc lượt quiz này.`,
        });
        continue;
      }
      if (seenQuestions.has(qId)) {
        validationErrors.push({
          path: `answers[${i}].questionVersionId`,
          code: 'INVALID_FIELD',
          message: `Câu hỏi '${qId}' bị nộp đáp án trùng lặp.`,
        });
        continue;
      }
      seenQuestions.add(qId);

      const q = snapshotQuestionsMap.get(qId);
      const hasOption = ans.optionId !== undefined;
      const hasText = ans.text !== undefined;

      if (q.type === 'multipleChoice') {
        if (hasText) {
          validationErrors.push({
            path: `answers[${i}].text`,
            code: 'INVALID_FIELD',
            message: `Câu '${qId}' là trắc nghiệm, không nhận text.`,
          });
        }
        if (
          hasOption &&
          !(q.options || []).some(
            (/** @type {any} */ opt) => opt.id === ans.optionId,
          )
        ) {
          validationErrors.push({
            path: `answers[${i}].optionId`,
            code: 'INVALID_FIELD',
            message: `Lựa chọn '${ans.optionId}' không hợp lệ cho câu hỏi '${qId}'.`,
          });
        }
      } else if (q.type === 'shortAnswer') {
        if (hasOption) {
          validationErrors.push({
            path: `answers[${i}].optionId`,
            code: 'INVALID_FIELD',
            message: `Câu '${qId}' là điền ngắn, không nhận optionId.`,
          });
        }
      }
    }

    if (validationErrors.length > 0) {
      throw createValidationError(validationErrors);
    }

    // 6. Chấm điểm server-side
    const {
      score,
      results,
      answers: gradedAnswers,
    } = gradeQuizAnswers(attempt.questions, answers);

    const now = new Date();
    const updateData = {
      status: 'submitted',
      answers: gradedAnswers,
      results,
      score,
      submittedAt: now,
      submitOperationId: idempotencyKey,
      submitPayloadHash: payloadHash,
    };

    // 7. Thực thi submit CAS trong transaction
    const updated = await submitQuizAttemptCas({
      id: attempt._id,
      ownerKey: identity.actorKey,
      expectedVersion,
      updateData,
      session,
    });

    if (!updated) {
      const current = await findQuizAttemptById(id, { session });
      if (current?.status === 'submitted') {
        if (matchesSubmission(current)) {
          return current;
        }
        if (idempotencyKey && current.submitOperationId === idempotencyKey) {
          throw new AppError({
            status: 409,
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key đã dùng với nội dung khác.',
          });
        }
        throw new AppError({
          status: 409,
          code: 'QUIZ_ALREADY_SUBMITTED',
          message: 'Lượt quiz đã được nộp trước đó với câu trả lời khác.',
        });
      }
      throw new AppError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Xung đột phiên bản khi nộp quiz.',
        details: { currentVersion: current?.version ?? expectedVersion },
      });
    }

    // 8. Tăng thống kê trọn đời trong cùng transaction (TX-10)
    await incrementSubmittedQuizCount(db, { session });

    return updated;
  });

  return toQuizResultDto(submittedAttempt);
}

/**
 * Lấy danh sách lịch sử quiz của người học / khách (07 §9.2, B6).
 *
 * @param {Object} params
 * @param {Identity} params.identity
 * @param {string} [params.sourceSessionId]
 * @param {number} [params.limit]
 * @param {string} [params.cursor]
 */
export async function listQuizzes({
  identity,
  sourceSessionId,
  limit,
  cursor,
}) {
  const db = await connectDatabase();
  await guestAccess(db, identity, null, false);
  const { items, nextCursor } = await listQuizAttempts({
    ownerKey: identity.actorKey,
    sourceSessionId,
    limit,
    cursor,
  });

  const summaryItems = items.map((doc) => ({
    id: doc._id.toHexString ? doc._id.toHexString() : String(doc._id),
    deckVersionId: doc.deckVersionId.toHexString
      ? doc.deckVersionId.toHexString()
      : String(doc.deckVersionId),
    ...(doc.sourceSessionId && {
      sourceSessionId: doc.sourceSessionId.toHexString
        ? doc.sourceSessionId.toHexString()
        : String(doc.sourceSessionId),
    }),
    status: doc.status,
    total: doc.total,
    ...(doc.status === 'submitted' && { score: doc.score }),
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : new Date(doc.createdAt).toISOString(),
    ...(doc.submittedAt && {
      submittedAt:
        doc.submittedAt instanceof Date
          ? doc.submittedAt.toISOString()
          : new Date(doc.submittedAt).toISOString(),
    }),
  }));

  return {
    items: summaryItems,
    nextCursor,
  };
}
