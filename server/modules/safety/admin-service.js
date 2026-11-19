import mongoose from 'mongoose';
import {
  AppError,
  createValidationError,
} from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { finishSessionEffects } from '../sessions/media-cleanup-service.js';
import {
  lockUserAccountWithinSession,
  unlockUserAccountWithinSession,
} from './safety-service.js';

const { ObjectId } = mongoose.Types;

export const USER_PROJECTION = {
  _id: 1,
  email: 1,
  displayName: 1,
  status: 1,
  version: 1,
  createdAt: 1,
};

export const REPORT_PROJECTION = {
  _id: 1,
  reporterKey: 1,
  reportedKey: 1,
  sessionId: 1,
  reason: 1,
  description: 1,
  status: 1,
  resolution: 1,
  handledBy: 1,
  handledAt: 1,
  version: 1,
  createdAt: 1,
};

/**
 * Maps a raw MongoDB user document to AdminUser DTO (07 §10).
 * Strips passwordHash, emailKey, authVersion, profile, role, avatarKey, statusChangedBy/At.
 *
 * @param {any} user
 * @returns {{ id: string, email: string, displayName: string, status: string, version: number }}
 */
export function toAdminUserDto(user) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    version: user.version,
  };
}

/**
 * Maps a raw MongoDB user document to AdminUserStatus DTO (07 §10).
 *
 * @param {any} user
 * @returns {{ id: string, status: string, version: number }}
 */
export function toAdminUserStatusDto(user) {
  return {
    id: String(user._id),
    status: user.status,
    version: user.version,
  };
}

/**
 * Maps a raw MongoDB report document to Report DTO (07 §10).
 * Optional fields (description, resolution, handledBy, handledAt) are omitted when absent.
 *
 * @param {any} report
 * @returns {{
 *   id: string,
 *   reporterKey: string,
 *   reportedKey: string,
 *   sessionId: string,
 *   reason: string,
 *   description?: string,
 *   status: string,
 *   resolution?: string,
 *   handledBy?: string,
 *   handledAt?: string,
 *   version: number,
 *   createdAt: string
 * }}
 */
export function toReportDto(report) {
  /** @type {any} */
  const dto = {
    id: String(report._id),
    reporterKey: report.reporterKey,
    reportedKey: report.reportedKey,
    sessionId: String(report.sessionId),
    reason: report.reason,
    status: report.status,
    version: report.version,
    createdAt:
      report.createdAt instanceof Date
        ? report.createdAt.toISOString()
        : new Date(report.createdAt).toISOString(),
  };

  if (report.description !== undefined && report.description !== null) {
    dto.description = report.description;
  }
  if (report.resolution !== undefined && report.resolution !== null) {
    dto.resolution = report.resolution;
  }
  if (report.handledBy !== undefined && report.handledBy !== null) {
    dto.handledBy = String(report.handledBy);
  }
  if (report.handledAt !== undefined && report.handledAt !== null) {
    dto.handledAt =
      report.handledAt instanceof Date
        ? report.handledAt.toISOString()
        : new Date(report.handledAt).toISOString();
  }

  return dto;
}

/**
 * Encodes keyset pagination cursor into a canonical base64url JSON string.
 * @param {Record<string, any>} item
 * @param {string} context
 * @returns {string}
 */
export function encodeAdminCursor(item, context) {
  if (
    !(item.createdAt instanceof Date) ||
    Number.isNaN(item.createdAt.getTime())
  ) {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Dữ liệu không có khóa sắp xếp hợp lệ.',
    });
  }
  const payload = {
    v: 1,
    ctx: context,
    c: item.createdAt.toISOString(),
    i: String(item._id).toLowerCase(),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes and rigorously validates an admin pagination cursor.
 * Returns null if tampering, malformed base64url, schema mismatch, or non-matching context is detected.
 *
 * @param {string} cursor
 * @param {string} expectedContext
 * @returns {{ createdAt: Date, id: import('mongoose').Types.ObjectId } | null}
 */
export function decodeAdminCursor(cursor, expectedContext) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const buf = Buffer.from(cursor, 'base64url');
    if (buf.toString('base64url') !== cursor) return null;
    const raw = buf.toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    if (parsed.v !== 1) return null;
    if (parsed.ctx !== expectedContext) return null;
    if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string') {
      return null;
    }
    const createdAt = new Date(parsed.c);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== parsed.c
    ) {
      return null;
    }
    if (!/^[0-9a-f]{24}$/u.test(parsed.i)) {
      return null;
    }
    return { createdAt, id: new ObjectId(parsed.i) };
  } catch {
    return null;
  }
}

/**
 * Lists users for admin dashboard with cursor-based keyset pagination (07 §10).
 *
 * @param {{
 *   status?: 'active' | 'locked',
 *   limit?: number,
 *   cursor?: string
 * }} input
 */
export async function listAdminUsers({ status, limit = 20, cursor }) {
  const db = await connectDatabase();
  const context = JSON.stringify([
    'admin-users',
    status ?? null,
    'createdAt:desc,_id:desc',
  ]);

  /** @type {Record<string, any>} */
  const query = { createdAt: { $type: 'date' } };
  if (status) {
    query.status = status;
  }

  if (cursor) {
    const decoded = decodeAdminCursor(cursor, context);
    if (!decoded) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ không hợp lệ hoặc không khớp danh sách.',
      });
    }
    query.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  const items = await db
    .collection('users')
    .find(query, { projection: USER_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeAdminCursor(pageItems[pageItems.length - 1], context)
      : null;

  return {
    items: pageItems.map(toAdminUserDto),
    nextCursor,
  };
}

/**
 * Lists user reports for admin dashboard with cursor-based keyset pagination (07 §10).
 *
 * @param {{
 *   status?: 'new' | 'inProgress' | 'resolved' | 'rejected',
 *   limit?: number,
 *   cursor?: string
 * }} input
 */
export async function listAdminReports({ status, limit = 20, cursor }) {
  const db = await connectDatabase();
  const context = JSON.stringify([
    'admin-reports',
    status ?? null,
    'createdAt:desc,_id:desc',
  ]);

  /** @type {Record<string, any>} */
  const query = { createdAt: { $type: 'date' } };
  if (status) {
    query.status = status;
  }

  if (cursor) {
    const decoded = decodeAdminCursor(cursor, context);
    if (!decoded) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ không hợp lệ hoặc không khớp danh sách.',
      });
    }
    query.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  const items = await db
    .collection('reports')
    .find(query, { projection: REPORT_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeAdminCursor(pageItems[pageItems.length - 1], context)
      : null;

  return {
    items: pageItems.map(toReportDto),
    nextCursor,
  };
}

/**
 * Retrieves detail of a single report by ID (07 §10).
 * @param {string} id
 */
export async function getAdminReport(id) {
  if (typeof id !== 'string' || !ObjectId.isValid(id)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID báo cáo không hợp lệ.',
    });
  }
  const db = await connectDatabase();
  const report = await db
    .collection('reports')
    .findOne({ _id: new ObjectId(id) }, { projection: REPORT_PROJECTION });
  if (!report) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy báo cáo.',
    });
  }
  return toReportDto(report);
}

/**
 * Updates a user account's status (active/locked) with CAS version guard and idempotency (07 §10, TX-05).
 *
 * @param {{
 *   identity: { userId: string, actorKey: string, role?: string },
 *   targetId: string,
 *   expectedVersion: number,
 *   status: 'active' | 'locked',
 *   operationId: string,
 *   now?: Date,
 *   effects?: typeof finishSessionEffects
 * }} input
 */
export async function setAdminUserStatus({
  identity,
  targetId,
  expectedVersion,
  status,
  operationId,
  now = new Date(),
  effects = finishSessionEffects,
}) {
  if (typeof targetId !== 'string' || !ObjectId.isValid(targetId)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID người dùng không hợp lệ.',
    });
  }

  const path = `/api/v1/admin/users/${targetId}/status`;
  const payload = { expectedVersion, status };

  /** @type {any} */
  let pendingEndedSession = null;

  const result = await runIdempotentOperation({
    actorKey: identity.actorKey,
    method: 'PATCH',
    path,
    operationId,
    payload,
    now,
    authorize: async ({ session }) => {
      const db = await connectDatabase();
      const adminUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(identity.userId) }, { session });
      if (!adminUser || adminUser.role !== 'admin') {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Chỉ có Quản trị viên mới được thực hiện thao tác này.',
        });
      }
      if (adminUser.status === 'locked') {
        throw new AppError({
          status: 403,
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản Quản trị viên đã bị khóa.',
        });
      }
    },
    execute: async ({ session }) => {
      pendingEndedSession = null;
      const db = await connectDatabase();
      const targetObjectId = new ObjectId(targetId);
      const targetUser = await db
        .collection('users')
        .findOne({ _id: targetObjectId }, { session });
      if (!targetUser) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy người dùng.',
        });
      }
      if (targetUser.version !== expectedVersion) {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: 'Phiên bản tài khoản không khớp. Vui lòng tải lại.',
          details: { currentVersion: targetUser.version },
        });
      }
      if (
        targetUser._id.equals(new ObjectId(identity.userId)) &&
        status === 'locked'
      ) {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Không thể tự khóa tài khoản của chính mình.',
        });
      }

      if (targetUser.role === 'admin' && status === 'locked') {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Không thể khóa tài khoản Quản trị viên qua API.',
        });
      }

      // No-op if status is already matching
      if (targetUser.status === status) {
        return {
          resultRef: targetId,
          value: {
            id: targetId,
            status: targetUser.status,
            version: targetUser.version,
          },
        };
      }

      if (status === 'locked') {
        const lockResult = await lockUserAccountWithinSession(db, session, {
          userId: targetId,
          adminId: identity.userId,
          expectedVersion,
          now,
        });
        pendingEndedSession = lockResult.endedSession;
        return {
          resultRef: targetId,
          value: {
            id: targetId,
            status: lockResult.lockedUser.status,
            version: lockResult.lockedUser.version,
          },
        };
      } else {
        const unlockResult = await unlockUserAccountWithinSession(db, session, {
          userId: targetId,
          adminId: identity.userId,
          expectedVersion,
          now,
        });
        return {
          resultRef: targetId,
          value: {
            id: targetId,
            status: unlockResult.unlockedUser.status,
            version: unlockResult.unlockedUser.version,
          },
        };
      }
    },
    replay: async ({ session }) => {
      const db = await connectDatabase();
      const targetObjectId = new ObjectId(targetId);
      const targetUser = await db
        .collection('users')
        .findOne({ _id: targetObjectId }, { session });
      if (!targetUser) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy người dùng.',
        });
      }
      return {
        id: targetId,
        status: targetUser.status,
        version: targetUser.version,
      };
    },
  });

  if (pendingEndedSession) {
    try {
      await effects(pendingEndedSession);
    } catch {
      console.warn(
        JSON.stringify({
          code: 'ACCOUNT_LOCK_EFFECTS_FAILED',
          sessionId: String(pendingEndedSession._id),
        }),
      );
    }
  }

  return result;
}

/**
 * Updates a report's status and resolution with CAS version guard and idempotency (07 §10).
 *
 * @param {{
 *   identity: { userId: string, actorKey: string, role?: string },
 *   id: string,
 *   expectedVersion: number,
 *   status: 'new' | 'inProgress' | 'resolved' | 'rejected',
 *   resolution?: string,
 *   operationId: string,
 *   now?: Date
 * }} input
 */
export async function updateAdminReport({
  identity,
  id,
  expectedVersion,
  status,
  resolution,
  operationId,
  now = new Date(),
}) {
  if (typeof id !== 'string' || !ObjectId.isValid(id)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID báo cáo không hợp lệ.',
    });
  }

  const path = `/api/v1/admin/reports/${id}`;
  const payload = {
    expectedVersion,
    status,
    ...(resolution !== undefined ? { resolution } : {}),
  };

  return runIdempotentOperation({
    actorKey: identity.actorKey,
    method: 'PATCH',
    path,
    operationId,
    payload,
    now,
    authorize: async ({ session }) => {
      const db = await connectDatabase();
      const adminUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(identity.userId) }, { session });
      if (!adminUser || adminUser.role !== 'admin') {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Chỉ có Quản trị viên mới được thực hiện thao tác này.',
        });
      }
      if (adminUser.status === 'locked') {
        throw new AppError({
          status: 403,
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản Quản trị viên đã bị khóa.',
        });
      }
    },
    execute: async ({ session }) => {
      const db = await connectDatabase();
      const reportObjectId = new ObjectId(id);
      const currentReport = await db
        .collection('reports')
        .findOne({ _id: reportObjectId }, { session });
      if (!currentReport) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy báo cáo.',
        });
      }
      if (currentReport.version !== expectedVersion) {
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: 'Phiên bản báo cáo không khớp. Vui lòng tải lại.',
          details: { currentVersion: currentReport.version },
        });
      }

      if (status === 'new' && resolution !== undefined) {
        throw createValidationError([
          {
            path: 'resolution',
            code: 'INVALID_RESOLUTION',
            message: 'Không được gửi resolution khi đặt trạng thái new.',
          },
        ]);
      }

      /** @type {Record<string, any>} */
      const setFields = { status, updatedAt: now };
      /** @type {Record<string, any>} */
      const unsetFields = {};
      if (status === 'new') {
        unsetFields.handledBy = '';
        unsetFields.handledAt = '';
        unsetFields.resolution = '';
      } else {
        setFields.handledBy = new ObjectId(identity.userId);
        setFields.handledAt = now;
      }
      if (resolution !== undefined) {
        setFields.resolution = resolution;
      }

      /** @type {Record<string, any>} */
      const updateDoc = {
        $set: setFields,
        $inc: { version: 1 },
      };
      if (Object.keys(unsetFields).length > 0) {
        updateDoc.$unset = unsetFields;
      }

      const updated = await db
        .collection('reports')
        .findOneAndUpdate(
          { _id: reportObjectId, version: expectedVersion },
          updateDoc,
          { session, returnDocument: 'after' },
        );

      if (!updated) {
        const reRead = await db
          .collection('reports')
          .findOne({ _id: reportObjectId }, { session });
        if (!reRead) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy báo cáo.',
          });
        }
        throw new AppError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: 'Phiên bản báo cáo không khớp. Vui lòng tải lại.',
          details: { currentVersion: reRead.version },
        });
      }

      return {
        resultRef: id,
        value: toReportDto(updated),
      };
    },
    replay: async ({ session }) => {
      const db = await connectDatabase();
      const reportObjectId = new ObjectId(id);
      const report = await db
        .collection('reports')
        .findOne({ _id: reportObjectId }, { session });
      if (!report) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy báo cáo.',
        });
      }
      return toReportDto(report);
    },
  });
}
