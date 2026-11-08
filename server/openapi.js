import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

export const OPENAPI_SPEC_PATH = fileURLToPath(
  new URL('../docs/api/openapi.yaml', import.meta.url),
);

export function readOpenApiDocument() {
  const document = parse(readFileSync(OPENAPI_SPEC_PATH, 'utf8'));
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('OpenAPI document must be an object');
  }
  return document;
}

export function createOpenApiRouter() {
  const router = express.Router();
  const document = readOpenApiDocument();

  router.get('/api/openapi.yaml', helmet(), (_request, response) => {
    response
      .type('application/yaml')
      .send(readFileSync(OPENAPI_SPEC_PATH, 'utf8'));
  });

  // Swagger UI requires inline bootstrap styles/scripts. Limit the relaxed CSP
  // to the documentation route instead of weakening application API headers.
  router.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Chiikaiwa API',
      swaggerOptions: {
        persistAuthorization: false,
        displayRequestDuration: true,
      },
    }),
  );

  return router;
}
