import { createHmac, timingSafeEqual } from 'node:crypto';
import { readAuthEnv } from '../../config/env.js';
import { AppError } from '../../middleware/http-error.js';

/** @typedef {Awaited<ReturnType<typeof import('./study-card-service.js').prepareStudyCardReveal>>['ticketClaims']} TicketClaims */

const prefix = 'chiikaiwa.study-review.v1';

/** @param {string} payload */
function signature(payload) {
  const { jwtSecret, jwtIssuer, jwtAudience } = readAuthEnv();
  return createHmac('sha256', jwtSecret)
    .update(JSON.stringify([prefix, jwtIssuer, jwtAudience, payload]))
    .digest('base64url');
}

/** @param {TicketClaims} claims */
export function signReviewTicket(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

/** @param {string} token @param {string} ownerKey @param {Date} now */
export function verifyReviewTicket(token, ownerKey, now) {
  const [payload, signed, extra] = token.split('.');
  if (payload && signed && extra === undefined) {
    const actual = Buffer.from(signed);
    const expected = Buffer.from(signature(payload));
    if (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    ) {
      const claims = /** @type {TicketClaims} */ (
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      );
      if (claims.ownerKey === ownerKey) {
        if (Date.parse(claims.expiresAt) <= now.getTime()) {
          throw new AppError({
            status: 409,
            code: 'REVIEW_TICKET_EXPIRED',
            message: 'Vé đánh giá đã hết hạn. Hãy mở lại đáp án.',
          });
        }
        return claims;
      }
    }
  }
  throw new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'Không tìm thấy vé đánh giá hợp lệ.',
  });
}
