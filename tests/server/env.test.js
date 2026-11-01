import { describe, expect, it } from 'vitest';
import { readEnv } from '../../server/config/env.js';

const source = {
  MONGODB_URI: 'mongodb://127.0.0.1:27018',
  MONGODB_DB_NAME: 'chiikaiwa_test',
};
describe('environment', () => {
  it('uses a bounded pool and predictable local defaults', () => {
    expect(readEnv(source)).toMatchObject({
      port: 3000,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
  });
  it('fails on missing database configuration without echoing credentials', () => {
    expect(() => readEnv({})).toThrow('MONGODB_URI');
    expect(() => readEnv({ ...source, MONGODB_URI: 'secret' })).toThrow(
      'MONGODB_URI must be a MongoDB connection URI',
    );
  });
  it.each(['0', '-1', '1.5', 'NaN', '65536'])(
    'rejects invalid port %s',
    (port) => {
      expect(() => readEnv({ ...source, PORT: port })).toThrow('PORT');
    },
  );
  it('requires HTTPS in production and rejects paths in the origin', () => {
    expect(() => readEnv({ ...source, NODE_ENV: 'production' })).toThrow(
      'HTTPS',
    );
    expect(() =>
      readEnv({ ...source, APP_ORIGIN: 'https://example.com/path' }),
    ).toThrow('APP_ORIGIN');
  });
  it('rejects malformed origins without exposing their value', () => {
    expect(() =>
      readEnv({ ...source, APP_ORIGIN: 'private-config-value' }),
    ).toThrow('APP_ORIGIN must be a valid HTTP origin');
  });
});
