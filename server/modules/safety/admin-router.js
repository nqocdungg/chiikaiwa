import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import {
  getAdminReport,
  listAdminReports,
  listAdminUsers,
  setAdminUserStatus,
  updateAdminReport,
} from './admin-service.js';
import {
  validateAdminReportsQuery,
  validateAdminReportUpdateBody,
  validateAdminUsersQuery,
  validateAdminUserStatusBody,
  validateIdempotencyKey,
  validateObjectId,
} from './admin-validation.js';

/**
 * Express router for Admin User management endpoints (07 §10).
 * Mounts at /api/v1/admin/users.
 * All routes require Admin role: requireAuth(['A']).
 */
export function createAdminUsersRouter() {
  const router = Router();
  router.use(requireAuth(['A']));

  router.get('/', async (request, response, next) => {
    try {
      const validated = validateAdminUsersQuery(request.query);
      const result = await listAdminUsers(validated);
      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.patch('/:id/status', async (request, response, next) => {
    try {
      const identity = response.locals.identity;
      await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });

      const targetId = validateObjectId(request.params.id, 'id');
      const operationId = validateIdempotencyKey(
        request.get('Idempotency-Key'),
      );
      const body = validateAdminUserStatusBody(request.body);

      const result = await setAdminUserStatus({
        identity,
        targetId,
        expectedVersion: body.expectedVersion,
        status: body.status,
        operationId,
      });

      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

/**
 * Express router for Admin Report management endpoints (07 §10).
 * Mounts at /api/v1/admin/reports.
 * All routes require Admin role: requireAuth(['A']).
 */
export function createAdminReportsRouter() {
  const router = Router();
  router.use(requireAuth(['A']));

  router.get('/', async (request, response, next) => {
    try {
      const validated = validateAdminReportsQuery(request.query);
      const result = await listAdminReports(validated);
      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      const id = validateObjectId(request.params.id, 'id');
      const result = await getAdminReport(id);
      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.patch('/:id', async (request, response, next) => {
    try {
      const identity = response.locals.identity;
      await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });

      const id = validateObjectId(request.params.id, 'id');
      const operationId = validateIdempotencyKey(
        request.get('Idempotency-Key'),
      );
      const body = validateAdminReportUpdateBody(request.body);

      const result = await updateAdminReport({
        identity,
        id,
        expectedVersion: body.expectedVersion,
        status: body.status,
        resolution: body.resolution,
        operationId,
      });

      return response.status(200).json({
        data: result,
        meta: response.locals.meta,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
