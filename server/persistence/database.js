import mongoose from 'mongoose';
import { readEnv } from '../config/env.js';

/** @type {Promise<typeof mongoose> | undefined} */
let pending;

export async function connectDatabase() {
  if (!pending) {
    const config = readEnv();
    pending = mongoose
      .connect(config.mongodbUri, {
        dbName: config.dbName,
        maxPoolSize: config.maxPoolSize,
        minPoolSize: 0,
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
        autoIndex: false,
        autoCreate: false,
        bufferCommands: false,
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
  }
  await pending;
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is not ready');
  return db;
}

/**
 * Run database writes atomically on the configured replica set.
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  await connectDatabase();
  return mongoose.connection.transaction(work, {
    readPreference: 'primary',
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
}

export async function checkDatabase() {
  const db = await connectDatabase();
  await db.command({ ping: 1 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  pending = undefined;
}
