import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/http-error.js';
import {
  createDraftContent,
  getContentItemDetail,
  hideContent,
  listContentItems,
  publishContent,
  updateDraftContent,
} from './content-service.js';

/**
 * Express router quản trị học liệu dành cho Admin (BE-003, 07 §10).
 * Mọi endpoint đều được bảo vệ bởi Admin guard requireAuth(['A']).
 */
export function createAdminContentRouter() {
  const router = Router();

  // Yêu cầu quyền Admin cho toàn bộ route
  router.use(requireAuth(['A']));

  router.get('/', async (request, response, next) => {
    try {
      const { kind, status, level, limit, cursor } = request.query;
      const result = await listContentItems({
        kind: typeof kind === 'string' ? kind : undefined,
        status: typeof status === 'string' ? status : undefined,
        level: typeof level === 'string' ? level : undefined,
        limit,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });

      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const rawKey = request.get('Idempotency-Key');
      const idempotencyKey = typeof rawKey === 'string' ? rawKey.trim() : '';

      if (!idempotencyKey) {
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

      const item = await createDraftContent({
        kind: request.body?.kind,
        draftPayload: request.body?.draftPayload,
        adminId: response.locals.identity.userId,
        actorKey: response.locals.identity.actorKey,
        idempotencyKey,
      });

      response.set('Location', `/api/v1/admin/content/${item.id}`);
      return response.status(201).json({
        data: item,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      const item = await getContentItemDetail({
        id: request.params.id,
      });

      return response.status(200).json({
        data: item,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.patch('/:id', async (request, response, next) => {
    try {
      const rawKey = request.get('Idempotency-Key');
      const idempotencyKey = typeof rawKey === 'string' ? rawKey.trim() : '';

      if (!idempotencyKey) {
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

      const item = await updateDraftContent({
        id: request.params.id,
        expectedVersion: request.body?.expectedVersion,
        draftPayload: request.body?.draftPayload,
        kind: request.body?.kind,
        adminId: response.locals.identity.userId,
        actorKey: response.locals.identity.actorKey,
        idempotencyKey,
      });

      return response.status(200).json({
        data: item,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/publish', async (request, response, next) => {
    try {
      const rawKey = request.get('Idempotency-Key');
      const idempotencyKey = typeof rawKey === 'string' ? rawKey.trim() : '';

      if (!idempotencyKey) {
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

      const item = await publishContent({
        id: request.params.id,
        expectedVersion: request.body?.expectedVersion,
        adminId: response.locals.identity.userId,
        actorKey: response.locals.identity.actorKey,
        idempotencyKey,
      });

      return response.status(200).json({
        data: item,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/hide', async (request, response, next) => {
    try {
      const rawKey = request.get('Idempotency-Key');
      const idempotencyKey = typeof rawKey === 'string' ? rawKey.trim() : '';

      if (!idempotencyKey) {
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

      const item = await hideContent({
        id: request.params.id,
        expectedVersion: request.body?.expectedVersion,
        adminId: response.locals.identity.userId,
        actorKey: response.locals.identity.actorKey,
        idempotencyKey,
      });

      return response.status(200).json({
        data: item,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
