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

export async function checkDatabase() {
  const db = await connectDatabase();
  await db.command({ ping: 1 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  pending = undefined;
}
