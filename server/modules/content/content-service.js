import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import {
  isValidObjectId,
  VALID_CONTENT_KINDS,
  VALID_LEVELS,
  validateContentItemDraftInput,
  validatePublishCompleteness,
  normalizePublishPayload,
  resolveDeckManifest,
  verifyDraftReferences,
} from './content-validator.js';
import {
  decodeContentCursor,
  encodeContentCursor,
  toContentItemDto,
  toTopicSummaryDto,
  toTopicVersionDetailDto,
  toKnowledgeItemDto,
} from './content-dto.js';
import {
  findContentItemById,
  findContentVersionById,
  findContentVersionsByIds,
  hideContentItemCas,
  insertContentItem,
  publishContentItemTx,
  queryContentItems,
  queryPublishedTopics,
  updateDraftContentItemCas,
} from './content-repository.js';

const { ObjectId } = mongoose.Types;

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

/**
 * Phân tích và kiểm tra tham số phân trang limit theo contract (07 §1, OpenAPI).
 * Chỉ chấp nhận số nguyên từ 1 đến 50. Nếu không truyền, mặc định là 20.
 *
 * @param {unknown} limit
 * @returns {number}
 */
export function parsePageLimit(limit) {
  if (limit === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }

  if (typeof limit !== 'string' && typeof limit !== 'number') {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'Tham số limit không hợp lệ. Phải là số nguyên từ 1 đến 50.',
    });
  }

  const str = String(limit).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'Tham số limit không hợp lệ. Phải là số nguyên từ 1 đến 50.',
    });
  }

  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 1 || num > MAX_PAGE_LIMIT) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: `Tham số limit vượt quá phạm vi cho phép (1-${MAX_PAGE_LIMIT}).`,
    });
  }

  return num;
}

/**
 * Tạo mới một bản ghi nháp học liệu (BE-003, 07 §10).
 *
 * @param {object} params
 * @param {string} params.kind
 * @param {Record<string, any>} params.draftPayload
 * @param {import('mongoose').Types.ObjectId} params.adminId
 * @param {string} params.actorKey
 * @param {string} [params.idempotencyKey]
 * @param {Date} [params.now]
 * @returns {Promise<import('./content-dto.js').ContentItemDto>}
 */
export async function createDraftContent({
  kind,
  draftPayload,
  adminId,
  actorKey,
  idempotencyKey,
  now = new Date(),
}) {
  const normalizedKey =
    typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!normalizedKey) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Header Idempotency-Key là bắt buộc và không được để trống.',
      details: {
        fields: [
          {
            path: 'Idempotency-Key',
            code: 'REQUIRED',
            message:
              'Header Idempotency-Key là bắt buộc và không được để trống.',
          },
        ],
      },
    });
  }

  const fieldErrors = validateContentItemDraftInput({ kind, draftPayload });
  if (fieldErrors.length > 0) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Dữ liệu gửi lên không đúng định dạng.',
      details: { fields: fieldErrors },
    });
  }

  const db = await connectDatabase();

  const refErrors = await verifyDraftReferences(db, kind, draftPayload);
  if (refErrors.length > 0) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Tham chiếu học liệu không tồn tại hoặc không hợp lệ.',
      details: { fields: refErrors },
    });
  }

  const newId = new ObjectId();
  /** @type {Record<string, any>} */
  const doc = {
    _id: newId,
    kind,
    status: /** @type {const} */ ('draft'),
    draftPayload,
    latestRevision: 0,
    version: 0,
    createdBy: adminId,
    updatedBy: adminId,
    createdAt: now,
    updatedAt: now,
  };

  if (kind === 'deck') {
    doc.level = draftPayload.level;
    doc.title = draftPayload.title;
  }

  const replayResult = await runIdempotentOperation({
    actorKey,
    method: 'POST',
    path: '/admin/content',
    operationId: normalizedKey,
    payload: { kind, draftPayload },
    authorize: async () => {},
    execute: async ({ session }) => {
      await insertContentItem(db, doc, { session });
      return {
        resultRef: newId.toHexString(),
        value: toContentItemDto(doc),
      };
    },
    replay: async ({ session, receipt }) => {
      const existing = await findContentItemById(db, receipt.resultRef, {
        session,
      });
      if (!existing) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy học liệu yêu cầu.',
        });
      }
      return toContentItemDto(existing);
    },
    now,
  });
  return /** @type {import('./content-dto.js').ContentItemDto} */ (
    replayResult
  );
}

/**
 * Cập nhật payload nháp của học liệu (BE-003, 07 §10).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {number} params.expectedVersion
 * @param {Record<string, any>} params.draftPayload
 * @param {string} [params.kind]
 * @param {import('mongoose').Types.ObjectId} params.adminId
 * @param {string} params.actorKey
 * @param {string} [params.idempotencyKey]
 * @param {Date} [params.now]
 * @returns {Promise<import('./content-dto.js').ContentItemDto>}
 */
export async function updateDraftContent({
  id,
  expectedVersion,
  draftPayload,
  kind,
  adminId,
  actorKey,
  idempotencyKey,
  now = new Date(),
}) {
  const normalizedKey =
    typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!normalizedKey) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Header Idempotency-Key là bắt buộc và không được để trống.',
      details: {
        fields: [
          {
            path: 'Idempotency-Key',
            code: 'REQUIRED',
            message:
              'Header Idempotency-Key là bắt buộc và không được để trống.',
          },
        ],
      },
    });
  }

  if (!isValidObjectId(id)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID học liệu không hợp lệ.',
    });
  }

  if (
    expectedVersion === undefined ||
    typeof expectedVersion !== 'number' ||
    expectedVersion < 0 ||
    !Number.isInteger(expectedVersion)
  ) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'expectedVersion phải là số nguyên không âm.',
      details: {
        fields: [
          {
            path: 'expectedVersion',
            code: 'REQUIRED',
            message: 'expectedVersion bắt buộc và phải là số nguyên không âm.',
          },
        ],
      },
    });
  }

  const db = await connectDatabase();
  const existing = await findContentItemById(db, id);
  if (!existing) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy học liệu yêu cầu.',
    });
  }

  // Chặn đổi kind sau khi tạo (07 §10)
  if (kind !== undefined && kind !== existing.kind) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Không được phép thay đổi loại học liệu sau khi đã tạo.',
      details: {
        fields: [
          {
            path: 'kind',
            code: 'IMMUTABLE_FIELD',
            message: 'Không được phép thay đổi loại học liệu sau khi đã tạo.',
          },
        ],
      },
    });
  }

  const fieldErrors = validateContentItemDraftInput({
    kind: existing.kind,
    draftPayload,
  });
  if (fieldErrors.length > 0) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Dữ liệu gửi lên không đúng định dạng.',
      details: { fields: fieldErrors },
    });
  }

  const refErrors = await verifyDraftReferences(
    db,
    existing.kind,
    draftPayload,
  );
  if (refErrors.length > 0) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Tham chiếu học liệu không tồn tại hoặc không hợp lệ.',
      details: { fields: refErrors },
    });
  }

  const level = existing.kind === 'deck' ? draftPayload.level : undefined;
  const title = existing.kind === 'deck' ? draftPayload.title : undefined;

  const replayResult = await runIdempotentOperation({
    actorKey,
    method: 'PATCH',
    path: `/admin/content/${id}`,
    operationId: normalizedKey,
    payload: { expectedVersion, draftPayload },
    authorize: async () => {},
    execute: async ({ session }) => {
      const updateResult = await updateDraftContentItemCas(
        db,
        {
          id,
          expectedVersion,
          draftPayload,
          level,
          title,
          updatedBy: adminId,
          now,
        },
        { session },
      );

      if (updateResult.status === 'conflict') {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: 'Phiên bản học liệu đã bị thay đổi bởi một thao tác khác.',
          details: { currentVersion: updateResult.currentVersion },
        });
      }

      if (updateResult.status === 'not_found') {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy học liệu yêu cầu.',
        });
      }

      return {
        resultRef: id,
        value: toContentItemDto(updateResult.doc),
      };
    },
    replay: async ({ session }) => {
      const current = await findContentItemById(db, id, { session });
      if (!current) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy học liệu yêu cầu.',
        });
      }
      return toContentItemDto(current);
    },
    now,
  });
  return /** @type {import('./content-dto.js').ContentItemDto} */ (
    replayResult
  );
}

/**
 * Lấy chi tiết một content item theo ID (BE-003, 07 §10).
 *
 * @param {{ id: string }} params
 * @returns {Promise<import('./content-dto.js').ContentItemDto>}
 */
export async function getContentItemDetail({ id }) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID học liệu không hợp lệ.',
    });
  }

  const db = await connectDatabase();
  const doc = await findContentItemById(db, id);
  if (!doc) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy học liệu yêu cầu.',
    });
  }

  return toContentItemDto(doc);
}

/**
 * Lấy danh sách content items theo bộ lọc và phân trang keyset cursor (BE-003, 07 §10).
 *
 * @param {object} params
 * @param {string} [params.kind]
 * @param {string} [params.status]
 * @param {string} [params.level]
 * @param {unknown} [params.limit]
 * @param {string} [params.cursor]
 * @returns {Promise<{ items: Array<import('./content-dto.js').ContentItemDto>, nextCursor: string | null }>}
 */
export async function listContentItems({ kind, status, level, limit, cursor }) {
  if (kind !== undefined && !VALID_CONTENT_KINDS.includes(kind)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: `Loại học liệu (kind) không hợp lệ. Phải thuộc: ${VALID_CONTENT_KINDS.join(', ')}.`,
    });
  }

  if (
    status !== undefined &&
    !['draft', 'published', 'hidden'].includes(status)
  ) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message:
        "Trạng thái (status) không hợp lệ. Phải thuộc: 'draft', 'published', 'hidden'.",
    });
  }

  if (level !== undefined && !VALID_LEVELS.includes(level)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: `Cấp độ (level) không hợp lệ. Phải thuộc: ${VALID_LEVELS.join(', ')}.`,
    });
  }

  const parsedLimit = parsePageLimit(limit);

  const filters = { kind, status, level };

  let decodedCursor = null;
  if (cursor !== undefined) {
    decodedCursor = decodeContentCursor(cursor, filters);
    if (!decodedCursor) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message:
          'Con trỏ phân trang (cursor) không hợp lệ hoặc không khớp bộ lọc.',
      });
    }
  }

  const db = await connectDatabase();
  const { items, hasMore } = await queryContentItems(db, {
    kind,
    status,
    level,
    limit: parsedLimit,
    cursor: decodedCursor,
  });

  const nextCursor =
    hasMore && items.length > 0
      ? encodeContentCursor(items[items.length - 1], filters)
      : null;

  return {
    items: items.map(toContentItemDto),
    nextCursor,
  };
}

/**
 * Xuất bản một bản ghi học liệu thành revision bất biến mới (BE-013, 07 §10, 06 TX-11).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {number} params.expectedVersion
 * @param {import('mongoose').Types.ObjectId} params.adminId
 * @param {string} params.actorKey
 * @param {string} params.idempotencyKey
 * @param {Date} [params.now]
 * @returns {Promise<import('./content-dto.js').ContentItemDto>}
 */
export async function publishContent({
  id,
  expectedVersion,
  adminId,
  actorKey,
  idempotencyKey,
  now = new Date(),
}) {
  const normalizedKey =
    typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!normalizedKey) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Header Idempotency-Key là bắt buộc và không được để trống.',
      details: {
        fields: [
          {
            path: 'Idempotency-Key',
            code: 'REQUIRED',
            message:
              'Header Idempotency-Key là bắt buộc và không được để trống.',
          },
        ],
      },
    });
  }

  if (!isValidObjectId(id)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy học liệu với ID '${id}'.`,
    });
  }

  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'expectedVersion phải là số nguyên không âm.',
      details: {
        fields: [
          {
            path: 'expectedVersion',
            code: 'INVALID_TYPE',
            message: 'expectedVersion phải là số nguyên không âm.',
          },
        ],
      },
    });
  }

  const db = await connectDatabase();

  const replayResult = await runIdempotentOperation({
    actorKey,
    method: 'POST',
    path: `/admin/content/${id}/publish`,
    operationId: normalizedKey,
    payload: { expectedVersion },
    authorize: async () => {},
    execute: async ({ session }) => {
      const item = await findContentItemById(db, id, { session });
      if (!item) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy học liệu với ID '${id}'.`,
        });
      }

      if (item.version !== expectedVersion) {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: `Xung đột phiên bản: expectedVersion là ${expectedVersion} nhưng phiên bản hiện tại là ${item.version}.`,
          details: { currentVersion: item.version },
        });
      }

      const completenessErrors = await validatePublishCompleteness(db, item, {
        session,
      });
      if (completenessErrors.length > 0) {
        throw new AppError({
          status: 422,
          code: 'CONTENT_INCOMPLETE',
          message: 'Học liệu chưa đủ điều kiện xuất bản.',
          details: { fields: completenessErrors },
        });
      }

      let normalizedPayload;
      if (item.kind === 'deck') {
        const { mergedPayload, errors: manifestErrors } =
          await resolveDeckManifest(db, item.draftPayload, { session });
        if (manifestErrors && manifestErrors.length > 0) {
          throw new AppError({
            status: 422,
            code: 'CONTENT_INCOMPLETE',
            message: 'Học liệu chưa đủ điều kiện xuất bản.',
            details: { fields: manifestErrors },
          });
        }
        normalizedPayload = mergedPayload;
      } else {
        normalizedPayload = normalizePublishPayload(
          item.kind,
          item.draftPayload,
        );
      }

      const res = await publishContentItemTx(
        db,
        {
          item,
          expectedVersion,
          normalizedPayload,
          adminId,
          now,
        },
        { session },
      );

      if (res.status === 'conflict') {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: `Xung đột phiên bản khi xuất bản: phiên bản hiện tại là ${res.currentVersion}.`,
          details: { currentVersion: res.currentVersion },
        });
      }

      return {
        resultRef: id,
        value: toContentItemDto(res.doc),
      };
    },
    replay: async ({ session }) => {
      const current = await findContentItemById(db, id, { session });
      if (!current) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy học liệu với ID '${id}'.`,
        });
      }
      return toContentItemDto(current);
    },
  });

  return /** @type {import('./content-dto.js').ContentItemDto} */ (
    replayResult
  );
}

/**
 * Ẩn học liệu có kiểm tra CAS expectedVersion, giữ nguyên con trỏ publishedVersionId (BE-013, 07 §10).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {number} params.expectedVersion
 * @param {import('mongoose').Types.ObjectId} params.adminId
 * @param {string} params.actorKey
 * @param {string} params.idempotencyKey
 * @param {Date} [params.now]
 * @returns {Promise<import('./content-dto.js').ContentItemDto>}
 */
export async function hideContent({
  id,
  expectedVersion,
  adminId,
  actorKey,
  idempotencyKey,
  now = new Date(),
}) {
  const normalizedKey =
    typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!normalizedKey) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Header Idempotency-Key là bắt buộc và không được để trống.',
      details: {
        fields: [
          {
            path: 'Idempotency-Key',
            code: 'REQUIRED',
            message:
              'Header Idempotency-Key là bắt buộc và không được để trống.',
          },
        ],
      },
    });
  }

  if (!isValidObjectId(id)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy học liệu với ID '${id}'.`,
    });
  }

  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new AppError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'expectedVersion phải là số nguyên không âm.',
      details: {
        fields: [
          {
            path: 'expectedVersion',
            code: 'INVALID_TYPE',
            message: 'expectedVersion phải là số nguyên không âm.',
          },
        ],
      },
    });
  }

  const db = await connectDatabase();

  const replayResult = await runIdempotentOperation({
    actorKey,
    method: 'POST',
    path: `/admin/content/${id}/hide`,
    operationId: normalizedKey,
    payload: { expectedVersion },
    authorize: async () => {},
    execute: async ({ session }) => {
      const res = await hideContentItemCas(
        db,
        {
          id,
          expectedVersion,
          adminId,
          now,
        },
        { session },
      );

      if (res.status === 'not_found') {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy học liệu với ID '${id}'.`,
        });
      }

      if (res.status === 'conflict') {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: `Xung đột phiên bản khi ẩn: expectedVersion là ${expectedVersion} nhưng phiên bản hiện tại là ${res.currentVersion}.`,
          details: { currentVersion: res.currentVersion },
        });
      }

      return {
        resultRef: id,
        value: toContentItemDto(res.doc),
      };
    },
    replay: async ({ session }) => {
      const current = await findContentItemById(db, id, { session });
      if (!current) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: `Không tìm thấy học liệu với ID '${id}'.`,
        });
      }
      return toContentItemDto(current);
    },
  });

  return /** @type {import('./content-dto.js').ContentItemDto} */ (
    replayResult
  );
}

/**
 * Lấy danh sách topics đã xuất bản dành cho Learner (07 §7).
 *
 * @param {object} params
 * @param {string} [params.level]
 * @param {unknown} [params.limit]
 * @param {string} [params.cursor]
 */
export async function listPublishedTopics({ level, limit, cursor }) {
  if (level !== undefined && !VALID_LEVELS.includes(level)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: `Cấp độ (level) không hợp lệ. Phải thuộc: ${VALID_LEVELS.join(', ')}.`,
    });
  }

  const parsedLimit = parsePageLimit(limit);

  const filters = { kind: 'deck', status: 'published', level };

  let decodedCursor = null;
  if (cursor !== undefined) {
    decodedCursor = decodeContentCursor(cursor, filters);
    if (!decodedCursor) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message:
          'Con trỏ phân trang (cursor) không hợp lệ hoặc không khớp bộ lọc.',
      });
    }
  }

  const db = await connectDatabase();
  const { items, hasMore } = await queryPublishedTopics(db, {
    level,
    limit: parsedLimit,
    cursor: decodedCursor,
  });

  const versionIds = items
    .map((item) => item.publishedVersionId)
    .filter(Boolean);
  const versions =
    versionIds.length > 0 ? await findContentVersionsByIds(db, versionIds) : [];
  const versionMap = new Map(versions.map((v) => [v._id.toHexString(), v]));

  const nextCursor =
    hasMore && items.length > 0
      ? encodeContentCursor(items[items.length - 1], filters)
      : null;

  return {
    items: items.map((item) => {
      const v = item.publishedVersionId
        ? versionMap.get(item.publishedVersionId.toHexString())
        : null;
      return toTopicSummaryDto(item, v);
    }),
    nextCursor,
  };
}

/**
 * Kiểm tra quyền truy cập theo nguồn đối với phiên bản chủ đề (07 §7, 06 §4.3, §6.1, §12.1).
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} params
 * @param {any} params.identity - Identity được giải mã từ cookie (user / guest)
 * @param {import('mongoose').Types.ObjectId} params.deckVersionId - ID của ContentVersion kind=deck
 * @param {Record<string, any>} params.parentItem - Document ContentItem cha
 */
async function assertDeckVersionSourceAccess(
  db,
  { identity, deckVersionId, parentItem },
) {
  if (!identity) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  // 1. Admin: luôn có quyền đọc
  if (identity.kind === 'user' && identity.role === 'admin') {
    return;
  }

  // 2. Guest (07 §7, 06 §4.3): Khách chỉ đọc học liệu trong lượt thử được cấp
  if (identity.kind === 'guest') {
    const guestDoc = await db.collection('guest_sessions').findOne({
      _id: identity.guestId,
    });
    const practiceSessionId =
      guestDoc?.practiceSessionId || identity.guestSession?.practiceSessionId;

    if (!practiceSessionId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message:
          'Khách chỉ được phép truy cập học liệu trong lượt thử được cấp.',
      });
    }

    const sessionDoc = await db.collection('practice_sessions').findOne({
      _id:
        practiceSessionId instanceof ObjectId
          ? practiceSessionId
          : new ObjectId(practiceSessionId),
    });

    if (
      !sessionDoc ||
      !sessionDoc.deckVersionId ||
      !sessionDoc.deckVersionId.equals(deckVersionId)
    ) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message:
          'Khách chỉ được phép truy cập học liệu trong lượt thử được cấp.',
      });
    }

    return;
  }

  // 3. Learner (07 §7, 06 §12.1):
  // - Nếu bản chủ đề đang xuất bản công khai và là revision mới nhất -> Cho phép đọc tự do
  const isLatestPublished =
    parentItem.status === 'published' &&
    parentItem.publishedVersionId &&
    parentItem.publishedVersionId.equals(deckVersionId);

  if (isLatestPublished) {
    return;
  }

  // - Nếu là bản ẩn (status === 'hidden') hoặc revision cũ (bản lịch sử):
  // Phải có nguồn hợp lệ: Từng tham gia phiên luyện có deckVersionId này, hoặc đã lưu trong saved_sources
  const actorKey = identity.actorKey;

  const [hasSession, hasSaved] = await Promise.all([
    db.collection('practice_sessions').findOne({
      'members.actorKey': actorKey,
      deckVersionId,
    }),
    db.collection('saved_sources').findOne({
      ownerKey: actorKey,
      deckVersionId,
    }),
  ]);

  if (hasSession || hasSaved) {
    return;
  }

  throw new AppError({
    status: 403,
    code: 'FORBIDDEN',
    message:
      'Bạn không có quyền truy cập bản học liệu lịch sử hoặc ẩn này khi không có nguồn hợp lệ.',
  });
}

/**
 * Kiểm tra quyền truy cập theo nguồn đối với mục kiến thức (07 §7, 06 §4.3, §12.1).
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} params
 * @param {any} params.identity - Identity được giải mã từ cookie (user / guest)
 * @param {import('mongoose').Types.ObjectId} params.knowledgeId - ID của ContentItem kind=knowledge
 * @param {import('mongoose').Types.ObjectId} [params.knowledgeVersionId] - ID của ContentVersion kind=knowledge (nếu có)
 * @param {Record<string, any>} params.parentItem - Document ContentItem cha
 */
async function assertKnowledgeSourceAccess(
  db,
  { identity, knowledgeId, knowledgeVersionId, parentItem },
) {
  if (!identity) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  // 1. Admin: luôn có quyền đọc
  if (identity.kind === 'user' && identity.role === 'admin') {
    return;
  }

  // 2. Guest: chỉ đọc học liệu trong lượt thử
  if (identity.kind === 'guest') {
    const guestDoc = await db.collection('guest_sessions').findOne({
      _id: identity.guestId,
    });
    const practiceSessionId =
      guestDoc?.practiceSessionId || identity.guestSession?.practiceSessionId;

    if (!practiceSessionId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message:
          'Khách chỉ được phép truy cập học liệu trong lượt thử được cấp.',
      });
    }

    const sessionDoc = await db.collection('practice_sessions').findOne({
      _id:
        practiceSessionId instanceof ObjectId
          ? practiceSessionId
          : new ObjectId(practiceSessionId),
    });

    if (!sessionDoc || !sessionDoc.deckVersionId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message:
          'Khách chỉ được phép truy cập học liệu trong lượt thử được cấp.',
      });
    }

    const trialDeck = await db.collection('content_versions').findOne({
      _id: sessionDoc.deckVersionId,
    });
    const knowledgeIdsInDeck = Array.isArray(
      trialDeck?.payload?.knowledgeVersionIds,
    )
      ? trialDeck.payload.knowledgeVersionIds.map(String)
      : [];

    if (knowledgeVersionId) {
      if (knowledgeIdsInDeck.includes(String(knowledgeVersionId))) {
        return;
      }
      const hasSaved = await db.collection('saved_sources').findOne({
        ownerKey: identity.actorKey,
        knowledgeId,
        knowledgeVersionId,
      });
      if (hasSaved) return;
    } else {
      if (
        parentItem.publishedVersionId &&
        knowledgeIdsInDeck.includes(String(parentItem.publishedVersionId))
      ) {
        return;
      }
      const hasSavedItem = await db.collection('saved_items').findOne({
        ownerKey: identity.actorKey,
        knowledgeId,
      });
      if (hasSavedItem) return;
    }

    throw new AppError({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Khách chỉ được phép truy cập học liệu trong lượt thử được cấp.',
    });
  }

  // 3. Learner:
  if (!knowledgeVersionId) {
    if (parentItem.status === 'published') {
      return;
    }

    const hasSource = await db.collection('saved_items').findOne({
      ownerKey: identity.actorKey,
      knowledgeId,
    });
    if (hasSource) return;

    throw new AppError({
      status: 403,
      code: 'FORBIDDEN',
      message:
        'Bạn không có quyền truy cập bản học liệu lịch sử hoặc ẩn này khi không có nguồn hợp lệ.',
    });
  }

  const isLatestPublished =
    parentItem.status === 'published' &&
    parentItem.publishedVersionId &&
    parentItem.publishedVersionId.equals(knowledgeVersionId);

  if (isLatestPublished) {
    return;
  }

  const hasSavedSource = await db.collection('saved_sources').findOne({
    ownerKey: identity.actorKey,
    knowledgeId,
    knowledgeVersionId,
  });

  if (hasSavedSource) {
    return;
  }

  const sessionWithKnowledge = await db
    .collection('practice_sessions')
    .aggregate([
      {
        $match: {
          'members.actorKey': identity.actorKey,
          deckVersionId: { $exists: true },
        },
      },
      {
        $lookup: {
          from: 'content_versions',
          localField: 'deckVersionId',
          foreignField: '_id',
          as: 'deckVersion',
        },
      },
      { $unwind: '$deckVersion' },
      {
        $match: {
          'deckVersion.payload.knowledgeVersionIds': knowledgeVersionId,
        },
      },
      { $limit: 1 },
    ])
    .toArray();

  if (sessionWithKnowledge.length > 0) {
    return;
  }

  throw new AppError({
    status: 403,
    code: 'FORBIDDEN',
    message:
      'Bạn không có quyền truy cập bản học liệu lịch sử hoặc ẩn này khi không có nguồn hợp lệ.',
  });
}

/**
 * Lấy chi tiết phiên bản bộ chủ đề dành cho Learner/Guest (07 §7).
 *
 * @param {object} params
 * @param {string} params.versionId
 * @param {any} [params.identity]
 */
export async function getTopicVersionDetail({ versionId, identity }) {
  if (!isValidObjectId(versionId)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  const db = await connectDatabase();
  const version = await findContentVersionById(db, versionId);
  if (!version || version.kind !== 'deck') {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  const parent = await findContentItemById(db, version.contentId);
  if (!parent || parent.status === 'draft') {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  if (identity) {
    await assertDeckVersionSourceAccess(db, {
      identity,
      deckVersionId: version._id,
      parentItem: parent,
    });
  }

  return toTopicVersionDetailDto(version);
}

/**
 * Lấy danh sách kiến thức của đúng bản nguồn chủ đề (07 §7).
 *
 * @param {object} params
 * @param {string} params.versionId
 * @param {unknown} [params.limit]
 * @param {string} [params.cursor]
 * @param {any} [params.identity]
 */
export async function getTopicVersionKnowledge({
  versionId,
  limit,
  cursor,
  identity,
}) {
  if (!isValidObjectId(versionId)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  const parsedLimit = parsePageLimit(limit);

  let offset = 0;
  if (cursor !== undefined) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        decoded.versionId !== versionId ||
        typeof decoded.offset !== 'number' ||
        !Number.isInteger(decoded.offset) ||
        decoded.offset < 0
      ) {
        throw new Error('invalid cursor');
      }
      offset = decoded.offset;
    } catch {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message:
          'Con trỏ phân trang (cursor) không hợp lệ hoặc không thuộc phiên bản chủ đề này.',
      });
    }
  }

  const db = await connectDatabase();
  const version = await findContentVersionById(db, versionId);
  if (!version || version.kind !== 'deck') {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  const parent = await findContentItemById(db, version.contentId);
  if (!parent || parent.status === 'draft') {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  if (identity) {
    await assertDeckVersionSourceAccess(db, {
      identity,
      deckVersionId: version._id,
      parentItem: parent,
    });
  }

  const knowledgeIds = Array.isArray(version.payload?.knowledgeVersionIds)
    ? version.payload.knowledgeVersionIds
    : [];

  const pagedIds = knowledgeIds.slice(offset, offset + parsedLimit);
  const hasMore = offset + parsedLimit < knowledgeIds.length;
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ versionId, offset: offset + parsedLimit }),
      ).toString('base64url')
    : null;

  if (pagedIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const knowledgeVersions = await findContentVersionsByIds(db, pagedIds);
  const versionMap = new Map(
    knowledgeVersions.map((v) => [v._id.toHexString(), v]),
  );

  const items = pagedIds
    .map((/** @type {any} */ id) =>
      versionMap.get(id.toHexString ? id.toHexString() : String(id)),
    )
    .filter(Boolean)
    .map(toKnowledgeItemDto);

  return {
    items,
    nextCursor,
  };
}

/**
 * Lấy chi tiết kiến thức dành cho Learner/Guest (07 §7).
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} [params.versionId]
 * @param {any} [params.identity]
 */
export async function getKnowledgeDetail({ id, versionId, identity }) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy mục kiến thức '${id}'.`,
    });
  }

  const db = await connectDatabase();

  if (versionId !== undefined) {
    if (!isValidObjectId(versionId)) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Không tìm thấy phiên bản kiến thức '${versionId}'.`,
      });
    }

    const versionDoc = await findContentVersionById(db, versionId);
    if (
      !versionDoc ||
      versionDoc.kind !== 'knowledge' ||
      versionDoc.contentId.toHexString() !== id
    ) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Không tìm thấy phiên bản kiến thức '${versionId}'.`,
      });
    }

    const parent = await findContentItemById(db, id);
    if (!parent || parent.status === 'draft') {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Không tìm thấy phiên bản kiến thức '${versionId}'.`,
      });
    }

    if (identity) {
      await assertKnowledgeSourceAccess(db, {
        identity,
        knowledgeId: parent._id,
        knowledgeVersionId: versionDoc._id,
        parentItem: parent,
      });
    }

    return toKnowledgeItemDto(versionDoc);
  }

  const item = await findContentItemById(db, id);
  if (
    !item ||
    item.kind !== 'knowledge' ||
    item.status === 'draft' ||
    !item.publishedVersionId
  ) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy mục kiến thức '${id}'.`,
    });
  }

  if (identity) {
    await assertKnowledgeSourceAccess(db, {
      identity,
      knowledgeId: item._id,
      parentItem: item,
    });
  }

  const versionDoc = await findContentVersionById(db, item.publishedVersionId);
  if (!versionDoc) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản kiến thức xuất bản của '${id}'.`,
    });
  }

  return toKnowledgeItemDto(versionDoc);
}
