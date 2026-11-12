import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  getKnowledgeDetail,
  getTopicVersionDetail,
  getTopicVersionKnowledge,
  listPublishedTopics,
} from './content-service.js';

/**
 * Router đọc học liệu công khai theo quyền dành cho Learner và Guest (BE-013, 07 §7).
 */
export function createLearnerContentRouter() {
  const router = Router();

  // GET /api/v1/topics (U)
  router.get('/topics', requireAuth(['U']), async (request, response, next) => {
    try {
      const { level, limit, cursor } = request.query;
      const result = await listPublishedTopics({
        level: typeof level === 'string' ? level : undefined,
        limit: typeof limit === 'string' ? limit : undefined,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });

      return response.status(200).json({
        data: result.items,
        meta: {
          ...response.locals.meta,
          nextCursor: result.nextCursor,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/v1/topic-versions/:id (U/G)
  router.get(
    '/topic-versions/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const rawId = request.params.id;
        const versionId = Array.isArray(rawId) ? rawId[0] : String(rawId);
        const item = await getTopicVersionDetail({
          versionId,
        });

        return response.status(200).json({
          data: item,
          meta: response.locals.meta,
        });
      } catch (err) {
        return next(err);
      }
    },
  );

  // GET /api/v1/topic-versions/:id/knowledge (U/G)
  router.get(
    '/topic-versions/:id/knowledge',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const rawId = request.params.id;
        const versionId = Array.isArray(rawId) ? rawId[0] : String(rawId);
        const { limit, cursor } = request.query;
        const result = await getTopicVersionKnowledge({
          versionId,
          limit: typeof limit === 'string' ? limit : undefined,
          cursor: typeof cursor === 'string' ? cursor : undefined,
        });

        return response.status(200).json({
          data: result.items,
          meta: {
            ...response.locals.meta,
            nextCursor: result.nextCursor,
          },
        });
      } catch (err) {
        return next(err);
      }
    },
  );

  // GET /api/v1/knowledge/:id (U/G)
  router.get(
    '/knowledge/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const rawId = request.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
        const { versionId } = request.query;
        const item = await getKnowledgeDetail({
          id,
          versionId: typeof versionId === 'string' ? versionId : undefined,
        });

        return response.status(200).json({
          data: item,
          meta: response.locals.meta,
        });
      } catch (err) {
        return next(err);
      }
    },
  );

  return router;
}
