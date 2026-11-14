import { describe, expect, it } from 'vitest';
import { readBrevoEnv, readEnv } from '../../server/config/env.js';

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
  it('requires a strong JWT_SECRET in production without exposing the secret', () => {
    expect(() =>
      readEnv({
        ...source,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://chiikaiwa.example.com',
        JWT_SECRET: 'short-secret-value',
      }),
    ).toThrow('JWT_SECRET must be at least 32 characters');
  });
  it('validates Brevo configuration and never echoes BREVO_API_KEY in error messages', () => {
    expect(
      readBrevoEnv({
        BREVO_API_KEY: '  xkeysib-test-api-key  ',
        BREVO_SENDER_EMAIL: '  no-reply@chiikaiwa.example.com  ',
      }),
    ).toEqual({
      apiKey: 'xkeysib-test-api-key',
      senderEmail: 'no-reply@chiikaiwa.example.com',
      senderName: 'Chiikaiwa',
      apiUrl: 'https://api.brevo.com/v3/smtp/email',
      timeoutMs: 5000,
      appOrigin: 'http://127.0.0.1:5173',
    });

    expect(() =>
      readBrevoEnv({
        BREVO_SENDER_EMAIL: 'no-reply@chiikaiwa.example.com',
      }),
    ).toThrow('BREVO_API_KEY is required');

    expect(() =>
      readBrevoEnv({
        BREVO_API_KEY: 'super-secret-brevo-key',
        BREVO_SENDER_EMAIL: 'not-an-email',
      }),
    ).toThrow('BREVO_SENDER_EMAIL must be a valid email address');

    expect(() =>
      readBrevoEnv({
        BREVO_API_KEY: 'super-secret-brevo-key',
        BREVO_SENDER_EMAIL: 'no-reply@chiikaiwa.example.com',
        BREVO_SENDER_NAME: '   ',
      }),
    ).toThrow('BREVO_SENDER_NAME must be between 1 and 100 characters');

    expect(() =>
      readBrevoEnv({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://chiikaiwa.example.com',
        JWT_SECRET: 'a'.repeat(32),
        BREVO_API_KEY: 'super-secret-brevo-key',
        BREVO_SENDER_EMAIL: 'no-reply@chiikaiwa.example.com',
        BREVO_API_URL: 'http://127.0.0.1:8080/v3/smtp/email',
      }),
    ).toThrow('BREVO_API_URL must use HTTPS');

    expect(() =>
      readBrevoEnv({
        BREVO_API_KEY: 'super-secret-brevo-key',
        BREVO_SENDER_EMAIL: 'no-reply@chiikaiwa.example.com',
        BREVO_TIMEOUT_MS: '100',
      }),
    ).toThrow('BREVO_TIMEOUT_MS must be an integer between 500 and 30000');
  });
});
