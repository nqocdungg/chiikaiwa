import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

const dbPath = resolve('.data/mongodb');
await mkdir(dbPath, { recursive: true });
const replicaSet = await MongoMemoryReplSet.create({
  binary: { version: '8.2.7' },
  instanceOpts: [{ port: 27018, dbPath }],
  replSet: {
    name: 'rs0',
    count: 1,
    storageEngine: 'wiredTiger',
    ip: '127.0.0.1',
  },
});
if (replicaSet.servers[0]?.instanceInfo?.port !== 27018) {
  await replicaSet.stop({ doCleanup: false });
  throw new Error(
    'Port 27018 is in use. Stop the conflicting local service before starting MongoDB.',
  );
}
console.info(
  'Local MongoDB replica set listening on 127.0.0.1:27018. Data: .data/mongodb',
);

async function stop() {
  await replicaSet.stop({ doCleanup: false });
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
