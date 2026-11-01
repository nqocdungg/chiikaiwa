import app from './app.js';
import { readEnv } from './config/env.js';
import { disconnectDatabase } from './persistence/database.js';

const config = readEnv();
const server = app.listen(config.port, '127.0.0.1', () => {
  console.info(`API listening at http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
