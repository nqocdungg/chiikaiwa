import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import { getCatalogsDto } from './catalogs.js';
import { updateUserProfile } from './identity-service.js';

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
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });
        const selfDto = await updateUserProfile({
          userId: identity.userId,
          rawBody: request.body,
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
