import { createHash } from 'node:crypto';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';

const coordinationModes = new Set([
  'searching',
  'proposed',
  'inviting',
  'requestingInvite',
  'inSession',
]);

const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

function actorBusyError() {
  return new AppError({
    status: 409,
    code: 'ACTOR_BUSY',
    message: 'Danh tính đang tham gia một luồng khác.',
  });
}

function idempotencyConflictError() {
  return new AppError({
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Khóa thao tác đã được dùng với nội dung khác.',
  });
}

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(/** @type {Record<string, unknown>} */ (value)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** @param {unknown} payload */
function hashPayload(payload) {
  return createHash('sha256')
    .update(canonicalJson(payload ?? {}))
    .digest('hex');
}

/** @param {unknown} error */
function isDuplicateKeyError(error) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000,
  );
}

/** @param {import('mongoose').mongo.Db} db */
function actorStates(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('actor_states')
  );
}

/** @param {import('mongoose').mongo.Db} db */
function operationReceipts(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('operation_receipts')
  );
}

/**
 * Atomically reserves an actor's idle state. Pass a transaction session when
 * the reservation must commit with writes to another collection.
 *
 * @param {{actorKey: string, mode: string, resourceId?: string, search?: Record<string, unknown>, session?: import('mongoose').ClientSession, now?: Date}} input
 */
export async function claimActorState({
  actorKey,
  mode,
  resourceId,
  search,
  session,
  now = new Date(),
}) {
  if (!actorKey || !coordinationModes.has(mode)) {
    throw new TypeError(
      'A valid actorKey and active coordination mode are required',
    );
  }
  if (!resourceId && !(mode === 'searching' && search?.requestId)) {
    throw new TypeError('An active actor state requires a resource identifier');
  }

  /** @param {import('mongoose').ClientSession} transactionSession */
  const reserve = async (transactionSession) => {
    const db = await connectDatabase();
    const collection = actorStates(db);
    const update = {
      $set: {
        mode,
        updatedAt: now,
        ...(resourceId ? { resourceId } : {}),
        ...(search ? { search } : {}),
      },
      $unset: {
        ...(!resourceId ? { resourceId: '' } : {}),
        ...(!search ? { search: '' } : {}),
      },
      $inc: { version: 1 },
      $setOnInsert: { createdAt: now },
    };
    const result = await collection.updateOne(
      { _id: actorKey, mode: 'idle' },
      update,
      { upsert: true, session: transactionSession },
    );

    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw actorBusyError();
    }
    return collection.findOne(
      { _id: actorKey },
      { session: transactionSession },
    );
  };

  try {
    return await (session ? reserve(session) : withTransaction(reserve));
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const db = await connectDatabase();
    const current = await actorStates(db).findOne({ _id: actorKey });
    if (current && current.mode !== 'idle') throw actorBusyError();
    throw error;
  }
}

/**
 * Releases a reservation only if the caller still owns the current version.
 * Pass a transaction session to combine the release with related writes.
 *
 * @param {{actorKey: string, expectedVersion: number, mode: string, resourceId: string, session?: import('mongoose').ClientSession, now?: Date}} input
 */
export async function releaseActorState({
  actorKey,
  expectedVersion,
  mode,
  resourceId,
  session,
  now = new Date(),
}) {
  /** @param {import('mongoose').ClientSession} transactionSession */
  const release = async (transactionSession) => {
    const db = await connectDatabase();
    const collection = actorStates(db);
    const result = await collection.updateOne(
      { _id: actorKey, mode, resourceId, version: expectedVersion },
      {
        $set: { mode: 'idle', updatedAt: now },
        $unset: { resourceId: '', search: '' },
        $inc: { version: 1 },
      },
      { session: transactionSession },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Trạng thái điều phối đã thay đổi.',
      });
    }
    return collection.findOne(
      { _id: actorKey },
      { session: transactionSession },
    );
  };
  return session ? release(session) : withTransaction(release);
}

/**
 * Reads the public coordination projection for the authenticated actor.
 * Role-bearing/private session data is intentionally excluded.
 *
 * @param {string} actorKey
 */
export async function getActorCoordination(actorKey) {
  const db = await connectDatabase();
  const state = await actorStates(db).findOne({ _id: actorKey });
  if (!state) return { mode: 'idle', version: 0 };

  /** @type {Record<string, unknown>} */
  const coordination = {
    mode: state.mode,
    version: state.version,
  };
  if (state.resourceId !== undefined) {
    coordination.resourceId = String(state.resourceId);
  }
  if (state.mode === 'searching' && state.search) {
    coordination.search = {
      requestId: state.search.requestId,
      criteria: {
        level: state.search.level,
        desiredMinutes: state.search.desiredMinutes,
        allowAdjacent: state.search.allowAdjacent,
        ...(state.search.filters ? { filters: state.search.filters } : {}),
      },
      queuedAt: state.search.queuedAt,
      leaseUntil: state.search.leaseUntil,
    };
  }
  return coordination;
}

/**
 * Executes a write once per actor/method/path/operation ID. Callbacks must
 * perform authorization against current state and rebuild replay responses
 * from current resources; receipt documents never store response bodies.
 *
 * @param {{actorKey: string, method: string, path: string, operationId: string, payload: unknown, authorize: (context: {session: import('mongoose').ClientSession, replay: boolean}) => Promise<void>, execute: (context: {session: import('mongoose').ClientSession}) => Promise<{resultRef?: string, value: unknown}>, replay: (context: {session: import('mongoose').ClientSession, receipt: Record<string, any>}) => Promise<unknown>, now?: Date}} input
 */
export async function runIdempotentOperation({
  actorKey,
  method,
  path,
  operationId,
  payload,
  authorize,
  execute,
  replay,
  now = new Date(),
}) {
  if (!actorKey || !method || !path || !operationId) {
    throw new TypeError('Actor, method, path, and operation ID are required');
  }
  const action = method.toUpperCase();
  const payloadHash = hashPayload(payload);
  const receiptKey = { actorKey, action, resourceKey: path, operationId };

  /** @param {import('mongoose').ClientSession} session */
  const process = async (session) => {
    const db = await connectDatabase();
    const collection = operationReceipts(db);
    const existing = await collection.findOne(receiptKey, { session });
    await authorize({ session, replay: Boolean(existing) });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw idempotencyConflictError();
      return replay({ session, receipt: existing });
    }

    const result = await execute({ session });
    await collection.insertOne(
      {
        ...receiptKey,
        payloadHash,
        ...(result.resultRef ? { resultRef: result.resultRef } : {}),
        committedAt: now,
        purgeAt: new Date(now.getTime() + RECEIPT_RETENTION_MS),
      },
      { session },
    );
    return result.value;
  };

  try {
    return await withTransaction(process);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return withTransaction(async (session) => {
      const db = await connectDatabase();
      const receipt = await operationReceipts(db).findOne(receiptKey, {
        session,
      });
      if (!receipt) throw error;
      await authorize({ session, replay: true });
      if (receipt.payloadHash !== payloadHash) throw idempotencyConflictError();
      return replay({ session, receipt });
    });
  }
}
