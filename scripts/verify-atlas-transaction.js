import { randomUUID } from 'node:crypto';
import { readEnv } from '../server/config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../server/persistence/database.js';

const config = readEnv();
if (
  !config.mongodbUri.startsWith('mongodb+srv://') ||
  config.dbName !== 'chiikaiwa_dev'
) {
  throw new Error(
    'Atlas transaction verification requires an Atlas URI and MONGODB_DB_NAME=chiikaiwa_dev.',
  );
}

const operationId = `ops002-${randomUUID()}`;
const eventId = operationId;
const now = new Date();
/** @type {import('mongoose').mongo.Db | undefined} */
let db;

try {
  db = await connectDatabase();
  const operations = db.collection('operation_receipts');
  const webhooks = db.collection('webhook_receipts');
  const [operationIndexes, webhookIndexes] = await Promise.all([
    operations.listIndexes().toArray(),
    webhooks.listIndexes().toArray(),
  ]);
  if (
    !operationIndexes.some(
      (index) => index.name === 'actor_action_resource_operation_unique',
    ) ||
    !webhookIndexes.some((index) => index.name === 'eventId_unique')
  ) {
    throw new Error(
      'Apply the OPS-002 migration on chiikaiwa_dev before checking transactions.',
    );
  }
  let injectedFailureReceived = false;

  try {
    await withTransaction(async (session) => {
      await operations.insertOne(
        {
          actorKey: operationId,
          action: 'ops002-verification',
          resourceKey: operationId,
          operationId,
          payloadHash: operationId,
          committedAt: now,
          purgeAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
        { session },
      );
      await webhooks.insertOne(
        {
          eventId,
          eventType: 'ops002-verification',
          roomName: operationId,
          occurredAt: now,
          processedAt: now,
          purgeAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
        { session },
      );
      throw new Error('OPS-002 intentional rollback');
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'OPS-002 intentional rollback'
    ) {
      injectedFailureReceived = true;
    } else {
      throw error;
    }
  }

  if (!injectedFailureReceived) {
    throw new Error('Transaction completed instead of rolling back.');
  }

  const [operationCount, webhookCount] = await Promise.all([
    operations.countDocuments({ operationId }),
    webhooks.countDocuments({ eventId }),
  ]);
  if (operationCount !== 0 || webhookCount !== 0) {
    throw new Error('Transaction rollback left test records in Atlas.');
  }

  console.info(
    'Atlas transaction rollback verified on chiikaiwa_dev; no test records remain.',
  );
} finally {
  try {
    if (db) {
      await Promise.all([
        db.collection('operation_receipts').deleteOne({ operationId }),
        db.collection('webhook_receipts').deleteOne({ eventId }),
      ]);
    }
  } finally {
    await disconnectDatabase();
  }
}
