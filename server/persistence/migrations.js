import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {{_id: string, checksum: string, appliedAt: Date}} MigrationRecord */
/** @typedef {{up: (db: import('mongoose').mongo.Db) => Promise<void>}} Migration */

/** @param {import('mongoose').mongo.Db} db @param {string} directory @param {boolean} [statusOnly] */
export async function runMigrations(db, directory, statusOnly = false) {
  const names = (await readdir(directory))
    .filter((name) => /^\d{14}-[a-z0-9-]+\.js$/u.test(name))
    .sort();
  /** @type {import('mongoose').mongo.Collection<MigrationRecord>} */
  const journal = db.collection('_schema_migrations');
  /** @type {import('mongoose').mongo.Collection<{_id: string, startedAt: Date}>} */
  const lock = db.collection('_migration_lock');
  if (!statusOnly) {
    try {
      await lock.insertOne({ _id: 'exclusive', startedAt: new Date() });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new Error(
          'A migration lock exists. Verify no migration is running before removing the stale lock.',
          { cause: error },
        );
      }
      throw error;
    }
  }
  try {
    const records = await journal.find().toArray();
    if (records.some((record) => !names.includes(record._id))) {
      throw new Error('An applied migration is missing from source control');
    }
    const planned = [];
    for (const name of names) {
      const path = join(directory, name);
      const checksum = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
      const applied = records.find((record) => record._id === name);
      if (applied && applied.checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`);
      planned.push({ name, path, checksum, applied });
    }
    const result = [];
    for (const { name, path, checksum, applied } of planned) {
      if (!applied && !statusOnly) {
        const migration = /** @type {Migration} */ (
          await import(pathToFileURL(path).href)
        );
        await migration.up(db);
        await journal.insertOne({ _id: name, checksum, appliedAt: new Date() });
      }
      result.push({
        name,
        status: applied || !statusOnly ? 'applied' : 'pending',
      });
    }
    return result;
  } finally {
    if (!statusOnly) await lock.deleteOne({ _id: 'exclusive' });
  }
}
