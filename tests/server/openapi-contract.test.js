import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import {
  OPENAPI_SPEC_PATH,
  readOpenApiDocument,
} from '../../server/openapi.js';

const expectedPaths = [
  '/webhooks/livekit',
  '/health',
  '/invitations',
  '/invitations/{invitationId}',
  '/invitations/{invitationId}/requests',
  '/invitation-requests',
  '/invitation-requests/{requestId}',
  '/invitation-requests/{requestId}/responses',
];

const writeOperations = [
  ['/invitations', 'post'],
  ['/invitations/{invitationId}', 'delete'],
  ['/invitation-requests', 'post'],
  ['/invitation-requests/{requestId}', 'delete'],
  ['/invitation-requests/{requestId}/responses', 'post'],
];

describe('OpenAPI contract', () => {
  const document = /** @type {Record<string, any>} */ (readOpenApiDocument());

  it('documents LiveKit signature auth, raw content type and response statuses without browser auth', () => {
    const webhook = document.paths['/webhooks/livekit'].post;
    expect(webhook.security).toEqual([{ livekitWebhookSignature: [] }]);
    expect(Object.keys(webhook.requestBody.content)).toEqual([
      'application/webhook+json',
    ]);
    expect(Object.keys(webhook.responses)).toEqual([
      '204',
      '401',
      '413',
      '415',
      '503',
    ]);
    expect(webhook.responses['204']).not.toHaveProperty('content');
    expect(webhook.parameters ?? []).not.toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(
      document.components.securitySchemes.livekitWebhookSignature,
    ).toMatchObject({ in: 'header', name: 'Authorization' });
  });

  it('parses the OpenAPI document and includes the implemented BE-009 paths', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers).toContainEqual(
      expect.objectContaining({ url: '/api/v1' }),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(expectedPaths),
    );
  });

  it('uses unique operation IDs and documents idempotency for every BE-009 write', () => {
    const operationIds = Object.values(document.paths).flatMap(
      (/** @type {Record<string, any>} */ pathItem) =>
        Object.values(pathItem)
          .filter(
            (operation) =>
              operation &&
              typeof operation === 'object' &&
              'operationId' in operation,
          )
          .map((operation) => operation.operationId),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);

    for (const [path, method] of writeOperations) {
      const parameters = document.paths[path][method].parameters ?? [];
      expect(parameters).toContainEqual({
        $ref: '#/components/parameters/IdempotencyKey',
      });
    }
  });

  it('documents DELETE expectedVersion and keeps examples free of env secrets', () => {
    for (const path of [
      '/invitations/{invitationId}',
      '/invitation-requests/{requestId}',
    ]) {
      expect(document.paths[path].delete.parameters).toContainEqual({
        $ref: '#/components/parameters/ExpectedVersion',
      });
    }

    const source = readFileSync(OPENAPI_SPEC_PATH, 'utf8');
    expect(source).not.toMatch(
      /JWT_SECRET|MONGODB_URI|LIVEKIT_API_(KEY|SECRET)/u,
    );
  });

  it('serves Swagger UI and the raw YAML without requiring database access', async () => {
    const app = createApp({ checkHealth: async () => {} });

    await request(app)
      .get('/api/docs/')
      .expect(200)
      .expect('Content-Type', /html/u)
      .expect(({ text, headers }) => {
        expect(text).toContain('<title>Chiikaiwa API</title>');
        expect(headers).not.toHaveProperty('content-security-policy');
      });

    await request(app)
      .get('/api/openapi.yaml')
      .expect(200)
      .expect('Content-Type', /application\/yaml/u)
      .expect(({ text }) => expect(text).toContain('openapi: 3.1.0'));
  });
  it('documents session reads, empty-body idempotent leave and bounded media credentials', () => {
    const get = document.paths['/sessions/{id}'].get;
    const leave = document.paths['/sessions/{id}/leave'].post;
    const token = document.paths['/sessions/{id}/media-token'].post;
    expect(get.security).toEqual([{ sessionCookie: [] }, { guestCookie: [] }]);
    expect(leave.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(leave.requestBody.content['application/json'].schema).toMatchObject({
      additionalProperties: false,
      maxProperties: 0,
    });
    expect(leave.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/SessionResponse',
    });
    expect(token.responses).toHaveProperty('409');
    expect(document.components.schemas.Session.additionalProperties).toBe(
      false,
    );
    expect(document.components.schemas.Session.properties).not.toHaveProperty(
      'mediaCleanup',
    );
    expect(
      document.components.schemas.SessionCurrentCard.properties,
    ).toHaveProperty('myRole');
    expect(
      document.components.schemas.SessionCurrentCard.properties,
    ).not.toHaveProperty('roleB');
    expect(
      document.components.schemas.SessionSlot.properties,
    ).not.toHaveProperty('scenarioVersionId');
  });
});
