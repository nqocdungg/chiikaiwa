import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { enforceWriteRateLimit } from '../../middleware/rate-limit.js';
import {
  createPairBlock as defaultCreatePairBlock,
  createReport as defaultCreateReport,
  deleteMyBlock as defaultDeleteMyBlock,
  listMyBlocks as defaultListMyBlocks,
} from './safety-service.js';
import {
  validateCreateBlockInput,
  validateCreateReportInput,
  validateIdempotencyKey,
  validateListBlocksQuery,
  validateObjectId,
} from './safety-validation.js';

/**
 * Router cho các API chặn và báo cáo của người học/khách (BE-019, 07 §10).
 *
 * @param {{
 *   createPairBlock?: typeof defaultCreatePairBlock,
 *   listMyBlocks?: typeof defaultListMyBlocks,
 *   deleteMyBlock?: typeof defaultDeleteMyBlock,
 *   createReport?: typeof defaultCreateReport,
 * }} [deps]
 */
export function createSafetyRouter({
  createPairBlock = defaultCreatePairBlock,
  listMyBlocks = defaultListMyBlocks,
  deleteMyBlock = defaultDeleteMyBlock,
  createReport = defaultCreateReport,
} = {}) {
  const router = express.Router();

  // GET /api/v1/me/blocks (U/G)
  router.get(
    '/me/blocks',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const query = validateListBlocksQuery(
          /** @type {Record<string, unknown>} */ (request.query),
        );
        const data = await listMyBlocks({
          actorKey: response.locals.identity.actorKey,
          ...query,
        });
        response.status(200).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  // POST /api/v1/me/blocks (U/G)
  router.post(
    '/me/blocks',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const { sessionId, targetActorKey } = validateCreateBlockInput(
          request.body,
        );
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        const identity = response.locals.identity;
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });

        const result = await createPairBlock({
          blockerKey: identity.actorKey,
          blockedKey: targetActorKey,
          sessionId,
          identity,
          idempotency: {
            method: 'POST',
            path: '/api/v1/me/blocks',
            operationId,
            payload: { sessionId, targetActorKey },
          },
        });

        response.status(200).json({
          data: { id: result.block?.id },
          meta: response.locals.meta,
        });
      } catch (caught) {
        next(caught);
      }
    },
  );

  // DELETE /api/v1/me/blocks/:id (U/G chủ)
  router.delete(
    '/me/blocks/:id',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const blockId = validateObjectId(request.params.id, 'id');
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        const identity = response.locals.identity;
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });

        await deleteMyBlock({
          actorKey: identity.actorKey,
          blockId,
          operationId,
        });

        response.status(204).end();
      } catch (caught) {
        next(caught);
      }
    },
  );

  // POST /api/v1/reports (U/G)
  router.post(
    '/reports',
    requireAuth(['U', 'G']),
    async (request, response, next) => {
      try {
        const input = validateCreateReportInput(request.body);
        const operationId = validateIdempotencyKey(
          request.get('Idempotency-Key'),
        );
        const identity = response.locals.identity;
        await enforceWriteRateLimit({ actorOrIpKey: identity.actorKey });

        const data = await createReport({
          identity,
          ...input,
          operationId,
        });

        response.status(201).json({ data, meta: response.locals.meta });
      } catch (caught) {
        next(caught);
      }
    },
  );

  return router;
}
