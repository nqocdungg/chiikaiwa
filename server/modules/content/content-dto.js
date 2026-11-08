import mongoose from 'mongoose';
import { isValidObjectId } from './content-validator.js';

const { ObjectId } = mongoose.Types;

/**
 * @typedef {Object} ContentItemDto
 * @property {string} id
 * @property {'deck' | 'scenario' | 'knowledge' | 'question'} kind
 * @property {'draft' | 'published' | 'hidden'} status
 * @property {number} latestRevision
 * @property {number} version
 * @property {string | null} publishedVersionId
 * @property {Record<string, any>} [draftPayload]
 * @property {string} [level]
 * @property {string} [title]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * Chuyển đổi bản ghi MongoDB content_items thành ContentItem DTO theo contract 07 §10.
 *
 * @param {Record<string, any>} doc
 * @returns {ContentItemDto}
 */
export function toContentItemDto(doc) {
  if (!doc) {
    throw new TypeError('Document is required to produce ContentItemDto');
  }

  /** @type {ContentItemDto} */
  const dto = {
    id: doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id),
    kind: doc.kind,
    status: doc.status,
    latestRevision: doc.latestRevision ?? 0,
    version: doc.version ?? 0,
    publishedVersionId: doc.publishedVersionId
      ? doc.publishedVersionId instanceof ObjectId
        ? doc.publishedVersionId.toHexString()
        : String(doc.publishedVersionId)
      : null,
  };

  if (doc.draftPayload !== undefined) {
    dto.draftPayload = doc.draftPayload;
  }

  if (doc.kind === 'deck') {
    if (doc.level !== undefined) {
      dto.level = doc.level;
    }
    if (doc.title !== undefined) {
      dto.title = doc.title;
    }
  }

  if (doc.createdAt) {
    dto.createdAt =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : new Date(doc.createdAt).toISOString();
  }

  if (doc.updatedAt) {
    dto.updatedAt =
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : new Date(doc.updatedAt).toISOString();
  }

  return dto;
}

/**
 * Mã hóa con trỏ phân trang từ bản ghi cuối cùng của trang, gắn kèm ngữ cảnh bộ lọc và thứ tự.
 * Sắp xếp theo: { createdAt: -1, _id: -1 }
 *
 * @param {{ createdAt: Date, _id: import('mongoose').Types.ObjectId | string }} doc
 * @param {{ kind?: string, status?: string, level?: string }} [filters]
 * @returns {string}
 */
export function encodeContentCursor(doc, filters = {}) {
  const createdAtIso =
    doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : new Date(doc.createdAt).toISOString();
  const idStr =
    doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);

  const payload = JSON.stringify({
    c: createdAtIso,
    i: idStr,
    k: filters.kind ?? null,
    s: filters.status ?? null,
    l: filters.level ?? null,
    o: 'createdAt_desc_id_desc',
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Giải mã con trỏ phân trang và xác thực tính khớp ngữ cảnh bộ lọc và thứ tự.
 * Trả về null nếu không hợp lệ hoặc bộ lọc không khớp.
 *
 * @param {string | undefined | null} cursor
 * @param {{ kind?: string, status?: string, level?: string }} [expectedFilters]
 * @returns {{ createdAt: Date, id: import('mongoose').Types.ObjectId } | null}
 */
export function decodeContentCursor(cursor, expectedFilters = {}) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    // Bắt buộc đủ các trường: c, i, k, s, l, o (API Specification §1)
    if (
      !('c' in parsed) ||
      !('i' in parsed) ||
      !('k' in parsed) ||
      !('s' in parsed) ||
      !('l' in parsed) ||
      !('o' in parsed)
    ) {
      return null;
    }

    const { c, i, k, s, l, o } = parsed;
    if (typeof c !== 'string' || typeof i !== 'string') return null;
    if (!isValidObjectId(i)) return null;

    // Bắt buộc thứ tự sắp xếp cố định của truy vấn
    if (o !== 'createdAt_desc_id_desc') return null;

    // Bộ lọc không đặt dùng null; bắt buộc khớp với truy vấn hiện tại
    const expectedKind = expectedFilters.kind ?? null;
    const expectedStatus = expectedFilters.status ?? null;
    const expectedLevel = expectedFilters.level ?? null;

    if (k !== expectedKind || s !== expectedStatus || l !== expectedLevel) {
      return null;
    }

    const createdAt = new Date(c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return {
      createdAt,
      id: new ObjectId(i),
    };
  } catch {
    return null;
  }
}
