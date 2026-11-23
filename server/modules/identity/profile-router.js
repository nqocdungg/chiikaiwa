import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/http-error.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import { getCatalogsDto } from './catalogs.js';
import { updateUserProfile } from './identity-service.js';
import { validateIdempotencyKey } from './validation.js';

export function createProfileRouter() {
  const router = express.Router();

  // GET /api/v1/catalogs (P)
  router.get('/catalogs', (_request, response) => {
    response.status(200).json({
      data: getCatalogsDto(),
      meta: response.locals.meta,
    });
  });

  // PATCH /api/v1/me/profile (U)
  router.patch(
    '/me/profile',
    requireAuth(['U']),
    async (request, response, next) => {
      try {
        const identity = response.locals.identity;
        const expectedActor = request.get('X-Expected-Actor');
        if (expectedActor !== undefined) {
          const normalizedExpected = expectedActor.trim();
          const currentUserId = String(identity.userId);
          if (
            normalizedExpected !== currentUserId &&
            normalizedExpected !== identity.actorKey
          ) {
            throw new AppError({
              status: 409,
              code: 'IDENTITY_CONFLICT',
              message:
                'Tài khoản đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ trước khi lưu.',
            });
          }
        }
        const idempotencyKey = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
        const selfDto = await updateUserProfile({
          userId: identity.userId,
          rawBody: request.body,
          idempotencyKey,
        });
        response.status(200).json({
          data: selfDto,
          meta: response.locals.meta,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
