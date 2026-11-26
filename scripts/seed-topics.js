import {
  connectDatabase,
  disconnectDatabase,
} from '../server/persistence/database.js';
import {
  assertDatabaseNotProtected,
  isProtectedDatabase,
  seedContentDataset,
} from '../server/persistence/seed/seed-content.js';
import {
  assertTopicContentV2Reviewed,
  prepareTopicContentV2,
} from '../server/persistence/seed/topic-content-v2.js';

const [databaseName, ...extraArgs] = process.argv.slice(2);

try {
  if (!databaseName || extraArgs.length > 0) {
    throw new Error('Sử dụng: npm run db:seed:topics -- <tên-database>');
  }
  if (
    databaseName !== process.env.MONGODB_DB_NAME ||
    isProtectedDatabase(databaseName)
  ) {
    throw new Error(
      'Tên database phải trùng MONGODB_DB_NAME và thuộc môi trường dev/demo/test.',
    );
  }
  assertTopicContentV2Reviewed();

  const db = await connectDatabase();
  assertDatabaseNotProtected(db);
  if (db.databaseName !== databaseName) {
    throw new Error('Database đã kết nối không trùng với database yêu cầu.');
  }

  const admin = await db
    .collection('users')
    .findOne({ role: 'admin', status: 'active' }, { projection: { _id: 1 } });
  if (!admin) throw new Error('Database phải có tài khoản Admin hoạt động.');

  const result = await seedContentDataset(db, prepareTopicContentV2(), {
    datasetName: 'topic-v2',
    adminId: admin._id,
  });
  if (!result.success) {
    for (const error of result.errors) console.error(error.message);
    process.exitCode = 1;
  }
  console.table(result.stats);
} catch (error) {
  console.error(
    '[seed:topics]',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
