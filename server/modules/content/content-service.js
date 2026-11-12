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
 * @param {number | string} [params.limit]
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

  let parsedLimit = DEFAULT_PAGE_LIMIT;
  if (limit !== undefined) {
    const num = Number(limit);
    if (!Number.isNaN(num) && num > 0) {
      parsedLimit = Math.min(Math.floor(num), MAX_PAGE_LIMIT);
    }
  }

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

      const normalizedPayload = normalizePublishPayload(
        item.kind,
        item.draftPayload,
      );

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
 * @param {string | number} [params.limit]
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

  let parsedLimit = DEFAULT_PAGE_LIMIT;
  if (limit !== undefined) {
    const num = Number(limit);
    if (!Number.isNaN(num) && num > 0) {
      parsedLimit = Math.min(Math.floor(num), MAX_PAGE_LIMIT);
    }
  }

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
 * Lấy chi tiết phiên bản bộ chủ đề dành cho Learner/Guest (07 §7).
 *
 * @param {object} params
 * @param {string} params.versionId
 */
export async function getTopicVersionDetail({ versionId }) {
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

  return toTopicVersionDetailDto(version);
}

/**
 * Lấy danh sách kiến thức của đúng bản nguồn chủ đề (07 §7).
 *
 * @param {object} params
 * @param {string} params.versionId
 * @param {string | number} [params.limit]
 * @param {string} [params.cursor]
 */
export async function getTopicVersionKnowledge({ versionId, limit, cursor }) {
  if (!isValidObjectId(versionId)) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: `Không tìm thấy phiên bản bộ chủ đề '${versionId}'.`,
    });
  }

  let parsedLimit = DEFAULT_PAGE_LIMIT;
  if (limit !== undefined) {
    const num = Number(limit);
    if (!Number.isNaN(num) && num > 0) {
      parsedLimit = Math.min(Math.floor(num), MAX_PAGE_LIMIT);
    }
  }

  let offset = 0;
  if (cursor !== undefined) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (typeof decoded.offset !== 'number' || decoded.offset < 0) {
        throw new Error('invalid offset');
      }
      offset = decoded.offset;
    } catch {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ phân trang (cursor) không hợp lệ.',
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

  const knowledgeIds = Array.isArray(version.payload?.knowledgeVersionIds)
    ? version.payload.knowledgeVersionIds
    : [];

  const pagedIds = knowledgeIds.slice(offset, offset + parsedLimit);
  const hasMore = offset + parsedLimit < knowledgeIds.length;
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ offset: offset + parsedLimit })).toString(
        'base64url',
      )
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
 */
export async function getKnowledgeDetail({ id, versionId }) {
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
