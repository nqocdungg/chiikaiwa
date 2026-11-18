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
  '/guest-trials',
  '/auth/me',
  '/auth/password-change',
  '/auth/password-reset-requests',
  '/auth/password-resets',
  '/admin/content/{id}/publish',
  '/admin/content/{id}/hide',
  '/topics',
  '/topic-versions/{id}',
  '/topic-versions/{id}/knowledge',
  '/knowledge/{id}',
  '/me/saved-items',
  '/me/saved-items/{id}',
  '/me/saved-items/{id}/sources',
  '/study/cards/query',
  '/study/cards/reveal',
  '/quizzes',
  '/quizzes/{id}',
  '/quizzes/{id}/submission',
  '/me/quizzes',
];

const writeOperations = [
  ['/invitations', 'post'],
  ['/invitations/{invitationId}', 'delete'],
  ['/invitation-requests', 'post'],
  ['/invitation-requests/{requestId}', 'delete'],
  ['/invitation-requests/{requestId}/responses', 'post'],
  ['/guest-trials', 'post'],
  ['/admin/content/{id}/publish', 'post'],
  ['/admin/content/{id}/hide', 'post'],
  ['/me/saved-items', 'post'],
  ['/me/saved-items/{id}', 'delete'],
  ['/quizzes', 'post'],
  ['/quizzes/{id}/submission', 'post'],
];

describe('OpenAPI contract', () => {
  const document = /** @type {Record<string, any>} */ (readOpenApiDocument());

  it('documents study-card rights and keeps answers out of the query projection', () => {
    for (const action of ['query', 'reveal']) {
      const operation = document.paths[`/study/cards/${action}`].post;
      expect(operation.security).toEqual([
        { sessionCookie: [], csrfToken: [] },
        { guestCookie: [], csrfToken: [] },
      ]);
      expect(operation.parameters ?? []).not.toContainEqual({
        $ref: '#/components/parameters/IdempotencyKey',
      });
    }
    const schemas = document.components.schemas;
    expect(
      schemas.StudyQueryResponse.properties.data.properties.items.items
        .properties,
    ).not.toHaveProperty('back');
    expect(schemas.StudyRevealResponse.properties.data.required).toContain(
      'reviewTicket',
    );
  });

  it('documents quiz rights and keeps snapshot answers out of public projection', () => {
    expect(
      document.tags.some((/** @type {any} */ tag) => tag.name === 'Quizzes'),
    ).toBe(true);

    // POST có csrfToken
    for (const path of ['/quizzes', '/quizzes/{id}/submission']) {
      const operation = document.paths[path].post;
      expect(operation.security).toEqual([
        { sessionCookie: [], csrfToken: [] },
        { guestCookie: [], csrfToken: [] },
      ]);
    }

    // GET không có csrfToken
    for (const path of ['/quizzes/{id}', '/me/quizzes']) {
      const operation = document.paths[path].get;
      expect(operation.security).toEqual([
        { sessionCookie: [] },
        { guestCookie: [] },
      ]);
    }

    expect(document.paths['/me/quizzes'].get.responses).toHaveProperty('422');
    expect(document.paths['/me/quizzes'].get.responses).toHaveProperty('403');
    expect(document.paths['/quizzes/{id}'].get.responses).toHaveProperty('403');

    const schemas = document.components.schemas;
    expect(schemas.QuizQuestionPublic.properties).not.toHaveProperty(
      'correctOptionId',
    );
    expect(schemas.QuizQuestionPublic.properties).not.toHaveProperty(
      'acceptedAnswers',
    );
    expect(schemas.QuizQuestionPublic.properties).not.toHaveProperty(
      'explanation',
    );
    expect(schemas.QuizPublic.properties).toHaveProperty('version');
    expect(schemas.QuizResult.properties).toHaveProperty('version');
    expect(schemas.QuizResult.properties).toHaveProperty('answers');
    expect(schemas.QuizResult.properties).toHaveProperty('results');
    expect(schemas.QuizResultItem.properties).toHaveProperty('correctOptionId');
    expect(schemas.QuizResultItem.properties).toHaveProperty('explanation');
    expect(schemas.SubmitQuizRequest.properties.answers.maxItems).toBe(5);
    expect(schemas.SubmitQuizAnswerItem.properties.optionId.maxLength).toBe(64);
    expect(schemas.SubmitQuizAnswerItem.properties.text.maxLength).toBe(500);
  });

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

  it('documents safety guard error responses (403, 409, 410, 503) on invitation request acceptance', () => {
    const respondOp =
      document.paths['/invitation-requests/{requestId}/responses'].post;
    expect(Object.keys(respondOp.responses)).toEqual(
      expect.arrayContaining([
        '200',
        '401',
        '403',
        '404',
        '409',
        '410',
        '422',
        '503',
      ]),
    );
  });

  it('documents DELETE expectedVersion and keeps examples free of env secrets', () => {
    for (const path of [
      '/invitations/{invitationId}',
      '/invitation-requests/{requestId}',
      '/me/saved-items/{id}',
    ]) {
      expect(document.paths[path].delete.parameters).toContainEqual({
        $ref: '#/components/parameters/ExpectedVersion',
      });
    }

    const source = readFileSync(OPENAPI_SPEC_PATH, 'utf8');
    expect(source).not.toMatch(
      /JWT_SECRET|MONGODB_URI|LIVEKIT_API_(KEY|SECRET)|BREVO_API_KEY/u,
    );
  });

  it('documents BE-007 password change and reset endpoints without Idempotency-Key or auto-login cookies', () => {
    const passwordChange = document.paths['/auth/password-change'].post;
    const resetRequest = document.paths['/auth/password-reset-requests'].post;
    const resetConfirm = document.paths['/auth/password-resets'].post;

    expect(passwordChange.security).toEqual([
      { sessionCookie: [], csrfToken: [] },
    ]);
    expect(resetRequest.security).toEqual([{ csrfToken: [] }]);
    expect(resetConfirm.security).toEqual([{ csrfToken: [] }]);

    for (const op of [passwordChange, resetRequest, resetConfirm]) {
      expect(op.parameters ?? []).not.toContainEqual({
        $ref: '#/components/parameters/IdempotencyKey',
      });
    }

    expect(passwordChange.responses['204']).not.toHaveProperty('content');
    expect(
      resetRequest.responses['202'].content['application/json'].schema,
    ).toEqual({
      $ref: '#/components/schemas/PasswordResetRequestResponse',
    });
    expect(resetRequest.responses).toHaveProperty('503');
    expect(resetConfirm.responses['204']).not.toHaveProperty('content');
    expect(resetConfirm.responses).toHaveProperty('400');
  });

  it('documents POST /guest-trials and GET /auth/me without leaking guest internals', () => {
    const guestTrial = document.paths['/guest-trials'].post;
    expect(guestTrial.security).toEqual([{ csrfToken: [] }]);
    expect(guestTrial.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(
      guestTrial.requestBody.content['application/json'].schema,
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['code'],
    });
    expect(Object.keys(guestTrial.responses)).toEqual(
      expect.arrayContaining([
        '201',
        '400',
        '401',
        '403',
        '409',
        '410',
        '422',
        '429',
      ]),
    );
    expect(
      guestTrial.responses['201'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/GuestTrialResponse' });
    expect(guestTrial.responses['201'].headers).toHaveProperty('Set-Cookie');

    const authMe = document.paths['/auth/me'].get;
    expect(authMe.security).toEqual([
      { sessionCookie: [] },
      { guestCookie: [] },
    ]);
    expect(authMe.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/AuthMeResponse',
    });

    const schemas = document.components.schemas;
    expect(schemas.GuestTrial.required).toEqual(
      expect.arrayContaining(['request', 'guest']),
    );
    expect(schemas.GuestProjection.required).toEqual(['status']);
    expect(schemas.AuthMe.oneOf[1].properties.guest).toEqual({
      $ref: '#/components/schemas/GuestProjection',
    });
    for (const field of ['credentialHash', 'emailKey', 'authVersion']) {
      expect(schemas.GuestProjection.properties).not.toHaveProperty(field);
      expect(schemas.AuthMe.oneOf[1].properties).not.toHaveProperty(field);
    }
    expect(schemas.AuthMe.oneOf[0].properties.kind).toEqual({ const: 'user' });
    expect(schemas.AuthMe.oneOf[1].properties.kind).toEqual({
      const: 'guest',
    });
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

  it('documents PATCH /me/profile with optional X-Expected-Actor header, 409 conflict, and safe Self projection', () => {
    const patchProfile = document.paths['/me/profile'].patch;
    expect(patchProfile.security).toEqual([
      { sessionCookie: [], csrfToken: [] },
    ]);
    expect(patchProfile.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(patchProfile.parameters).toContainEqual({
      $ref: '#/components/parameters/ExpectedActor',
    });
    expect(patchProfile.responses).toHaveProperty('409');
    expect(document.components.parameters.ExpectedActor).toMatchObject({
      name: 'X-Expected-Actor',
      in: 'header',
      required: false,
      schema: {
        type: 'string',
        pattern: '^(user:)?[0-9a-fA-F]{24}$',
      },
    });
    expect(document.components.schemas.Self.additionalProperties).toBe(false);
    expect(document.components.schemas.Self.properties).not.toHaveProperty(
      'passwordHash',
    );
    expect(document.components.schemas.Self.properties).not.toHaveProperty(
      'authVersion',
    );
    expect(document.components.schemas.Self.properties).not.toHaveProperty(
      'emailKey',
    );
  });
});
