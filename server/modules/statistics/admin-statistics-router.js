import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getLifetimeStatistics } from './statistics-service.js';

/** GET /api/v1/admin/statistics (07 §10, BE-034). */
export function createAdminStatisticsRouter() {
  const router = Router();
  router.use(requireAuth(['A']));

  router.get('/', async (_request, response, next) => {
    try {
      const data = await getLifetimeStatistics();
      return response.status(200).json({ data, meta: response.locals.meta });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
