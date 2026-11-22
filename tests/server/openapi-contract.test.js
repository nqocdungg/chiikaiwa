import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import {
  OPENAPI_SPEC_PATH,
  readOpenApiDocument,
} from '../../server/openapi.js';
import {
  toAdminUserDto,
  toReportDto,
} from '../../server/modules/safety/admin-service.js';

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
  '/sessions/{id}/deck-options',
  '/sessions/{id}/deck-selection',
  '/sessions/{id}/control/claim',
  '/sessions/{id}/draws',
  '/sessions/{id}/cards/{cardId}/hints',
  '/sessions/{id}/actions',
  '/sessions/{id}/actions/{actionId}/responses',
  '/quizzes',
  '/quizzes/{id}',
  '/quizzes/{id}/submission',
  '/me/quizzes',
  '/admin/users',
  '/admin/users/{id}/status',
  '/admin/reports',
  '/admin/reports/{id}',
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
  ['/sessions/{id}/deck-selection', 'post'],
  ['/sessions/{id}/control/claim', 'post'],
  ['/sessions/{id}/draws', 'post'],
  ['/sessions/{id}/actions', 'post'],
  ['/sessions/{id}/actions/{actionId}/responses', 'post'],
  ['/quizzes', 'post'],
  ['/quizzes/{id}/submission', 'post'],
  ['/admin/users/{id}/status', 'patch'],
  ['/admin/reports/{id}', 'patch'],
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

  it('parses the OpenAPI document and includes the expected paths', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers).toContainEqual(
      expect.objectContaining({ url: '/api/v1' }),
    );
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(expectedPaths),
    );
  });

  it('uses unique operation IDs and documents idempotency for the listed writes', () => {
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
  it('documents deck counts, per-viewer saved status and the action creation envelope', () => {
    const schemas = document.components.schemas;
    expect(
      schemas.SessionDeckOptionsResponse.properties.data.properties.items.items
        .required,
    ).toContain('scenarioCount');
    expect(
      document.paths['/sessions/{id}/deck-options'].get.responses['409'],
    ).toMatchObject({ description: expect.stringContaining('SESSION_ENDED') });
    expect(schemas.SessionHintKnowledge).toMatchObject({
      required: expect.arrayContaining(['versionId', 'isSaved']),
      properties: {
        versionId: expect.any(Object),
        isSaved: { type: 'boolean' },
      },
      additionalProperties: false,
    });
    expect(
      document.paths['/sessions/{id}/actions'].post.responses['201'].content[
        'application/json'
      ].schema,
    ).toEqual({
      $ref: '#/components/schemas/SessionActionResponse',
    });
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

  it('documents Admin users and reports endpoints, idempotency, strict schemas and privacy isolation', () => {
    expect(
      document.tags.some(
        (/** @type {any} */ tag) => tag.name === 'Admin Operations',
      ),
    ).toBe(true);

    for (const path of [
      '/admin/users',
      '/admin/reports',
      '/admin/reports/{id}',
    ]) {
      const operation = document.paths[path].get;
      expect(operation.security).toEqual([{ sessionCookie: [] }]);
      expect(operation.responses).toHaveProperty('401');
      expect(operation.responses).toHaveProperty('403');
    }

    for (const path of ['/admin/users/{id}/status', '/admin/reports/{id}']) {
      const operation = document.paths[path].patch;
      expect(operation.security).toEqual([
        { sessionCookie: [], csrfToken: [] },
      ]);
      expect(operation.responses).toHaveProperty('401');
      expect(operation.responses).toHaveProperty('403');
      expect(operation.responses).toHaveProperty('409');
      expect(operation.parameters).toContainEqual({
        $ref: '#/components/parameters/IdempotencyKey',
      });
    }

    const schemas = document.components.schemas;
    expect(schemas.AdminUser.additionalProperties).toBe(false);
    for (const field of [
      'passwordHash',
      'authVersion',
      'role',
      'profile',
      'emailKey',
    ]) {
      expect(schemas.AdminUser.properties).not.toHaveProperty(field);
    }
    expect(schemas.AdminUser.required).toEqual(
      expect.arrayContaining([
        'id',
        'email',
        'displayName',
        'status',
        'version',
      ]),
    );
    expect(schemas.AdminUser.properties).not.toHaveProperty('createdAt');
    expect(schemas.AdminUser.properties).not.toHaveProperty('avatarKey');
    expect(
      schemas.AdminUserStatusRequest.properties.expectedVersion.minimum,
    ).toBe(0);
    expect(
      schemas.AdminUserStatusResponse.properties.data.properties.version
        .minimum,
    ).toBe(0);

    expect(schemas.Report.additionalProperties).toBe(false);
    expect(schemas.Report.required).toEqual(
      expect.arrayContaining([
        'id',
        'reporterKey',
        'reportedKey',
        'sessionId',
        'reason',
        'status',
        'version',
        'createdAt',
      ]),
    );
    expect(schemas.Report.properties.reason).not.toHaveProperty('enum');
    expect(schemas.Report.properties.version.minimum).toBe(0);
    expect(schemas.ReportUpdateRequest.properties.expectedVersion.minimum).toBe(
      0,
    );
    expect(schemas.ReportUpdateRequest.properties.resolution.maxLength).toBe(
      2000,
    );
  });

  it('ensures toAdminUserDto and toReportDto match OpenAPI schema properties and required fields', () => {
    const schemas = document.components.schemas;

    const sampleUserDoc = {
      _id: { toHexString: () => '507f1f77bcf86cd799439011' },
      email: 'test@example.com',
      displayName: 'Test User',
      status: 'active',
      version: 0,
      role: 'learner',
      passwordHash: 'secret',
      authVersion: 1,
    };
    const userDto = toAdminUserDto(sampleUserDoc);
    const userDtoKeys = Object.keys(userDto);
    const adminUserSchemaPropKeys = Object.keys(schemas.AdminUser.properties);
    expect(userDtoKeys.sort()).toEqual(adminUserSchemaPropKeys.sort());
    for (const reqField of schemas.AdminUser.required) {
      expect(userDto).toHaveProperty(reqField);
    }

    const sampleReportDoc = {
      _id: { toHexString: () => '507f1f77bcf86cd799439022' },
      reporterKey: 'user:507f1f77bcf86cd799439011',
      reportedKey: 'user:507f1f77bcf86cd799439012',
      sessionId: { toHexString: () => '507f1f77bcf86cd799439033' },
      reason: 'Harassment',
      description: 'Detail text',
      status: 'inProgress',
      resolution: 'Resolved note',
      handledBy: { toHexString: () => '507f1f77bcf86cd799439099' },
      handledAt: new Date(),
      version: 0,
      createdAt: new Date(),
    };
    const reportDto = toReportDto(sampleReportDoc);
    const reportDtoKeys = Object.keys(reportDto);
    const reportSchemaPropKeys = Object.keys(schemas.Report.properties);
    for (const key of reportDtoKeys) {
      expect(reportSchemaPropKeys).toContain(key);
    }
    for (const reqField of schemas.Report.required) {
      expect(reportDto).toHaveProperty(reqField);
    }
  });
});
