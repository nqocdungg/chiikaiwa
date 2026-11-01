import { fileURLToPath } from 'node:url';
import {
  connectDatabase,
  disconnectDatabase,
} from '../server/persistence/database.js';
import { runMigrations } from '../server/persistence/migrations.js';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--status')) {
  console.error('Usage: npm run db:migrate | npm run db:status');
  process.exit(1);
}

try {
  const db = await connectDatabase();
  const directory = fileURLToPath(
    new URL('../server/persistence/migrations/', import.meta.url),
  );
  const result = await runMigrations(db, directory, args[0] === '--status');
  console.info(result.length ? result : 'No business migrations registered.');
} catch {
  console.error(
    'Migration failed. Check database availability, migration integrity and the migration lock.',
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
