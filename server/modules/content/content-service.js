import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import {
  isValidObjectId,
  VALID_CONTENT_KINDS,
  VALID_LEVELS,
  validateContentItemDraftInput,
  verifyDraftReferences,
} from './content-validator.js';
import {
  decodeContentCursor,
  encodeContentCursor,
  toContentItemDto,
} from './content-dto.js';
import {
  findContentItemById,
  insertContentItem,
  queryContentItems,
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
