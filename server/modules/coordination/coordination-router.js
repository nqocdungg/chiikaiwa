import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getActorCoordination } from './coordination-service.js';

export function createCoordinationRouter() {
  const router = express.Router();

  router.get(
    '/me/coordination',
    requireAuth(['U', 'G']),
    async (_request, response, next) => {
      try {
        const { actorKey } = response.locals.identity;
        const data = await getActorCoordination(actorKey);
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
