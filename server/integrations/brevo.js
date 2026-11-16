import { readBrevoEnv } from '../config/env.js';
import { AppError } from '../middleware/http-error.js';

const EMAIL_SERVICE_UNAVAILABLE_MESSAGE =
  'Dịch vụ gửi email tạm thời không khả dụng. Vui lòng thử lại sau.';

/**
 * Escapes HTML special characters for safe interpolation in HTML email templates.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Builds the frontend password reset link from APP_ORIGIN and raw token.
 * @param {{ origin: string, token: string }} params
 * @returns {string}
 */
export function buildPasswordResetUrl({ origin, token }) {
  if (!origin || !URL.canParse(origin)) {
    throw new Error('Invalid application origin for password reset URL');
  }
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('Password reset token is required');
  }
  const url = new URL('/reset-password', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Creates a standardized 503 SERVICE_UNAVAILABLE error without exposing secrets,
 * tokens, reset links, or recipient addresses.
 * @returns {AppError}
 */
export function createEmailServiceUnavailableError() {
  return new AppError({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: EMAIL_SERVICE_UNAVAILABLE_MESSAGE,
  });
}

/**
 * Validates that Brevo environment configuration is ready before handling a reset request.
 * Throws 503 SERVICE_UNAVAILABLE if missing or invalid so public endpoints do not leak
 * whether an email exists when email configuration is unavailable.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertBrevoReady(env = process.env) {
  try {
    return readBrevoEnv(env);
  } catch {
    throw createEmailServiceUnavailableError();
  }
}

/**
 * Sends a password reset transactional email via Brevo HTTPS API (/v3/smtp/email).
 * Never logs or exposes the API key, raw token, reset URL, or recipient email.
 *
 * @param {{
 *   toEmail: string,
 *   displayName?: string,
 *   resetToken: string
 * }} params
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch
 * }} [options]
 * @returns {Promise<{ messageId: string | null }>}
 */
export async function sendPasswordResetEmail(
  { toEmail, displayName, resetToken },
  options = {},
) {
  const config = assertBrevoReady(options.env);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw createEmailServiceUnavailableError();
  }

  let resetUrl;
  try {
    resetUrl = buildPasswordResetUrl({
      origin: config.appOrigin,
      token: resetToken,
    });
  } catch {
    throw createEmailServiceUnavailableError();
  }

  const greetingName = displayName?.trim() ? displayName.trim() : 'bạn';
  const safeGreetingName = escapeHtml(greetingName);
  const safeResetUrl = escapeHtml(resetUrl);

  const subject = 'Chiikaiwa — Đặt lại mật khẩu của bạn';
  const textContent = [
    `Xin chào ${greetingName},`,
    '',
    'Hệ thống Chiikaiwa nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
    'Liên kết đặt lại mật khẩu dưới đây có hiệu lực trong 15 phút và chỉ sử dụng được một lần:',
    resetUrl,
    '',
    'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Mật khẩu hiện tại của bạn sẽ không thay đổi.',
  ].join('\n');

  const htmlContent = [
    `<p>Xin chào <strong>${safeGreetingName}</strong>,</p>`,
    '<p>Hệ thống Chiikaiwa nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>',
    '<p>Liên kết đặt lại mật khẩu dưới đây có hiệu lực trong <strong>15 phút</strong> và <strong>chỉ sử dụng được một lần</strong>:</p>',
    `<p><a href="${safeResetUrl}">Đặt lại mật khẩu Chiikaiwa</a></p>`,
    `<p>Nếu nút trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:<br><code>${safeResetUrl}</code></p>`,
    '<p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Mật khẩu hiện tại của bạn sẽ không thay đổi.</p>',
  ].join('');

  /** @type {{ email: string, name?: string }} */
  const recipient = { email: toEmail };
  if (displayName?.trim()) {
    recipient.name = displayName.trim();
  }

  const payload = {
    sender: {
      name: config.senderName,
      email: config.senderEmail,
    },
    to: [recipient],
    subject,
    textContent,
    htmlContent,
  };

  /** @type {Response} */
  let response;
  try {
    response = await fetchImpl(config.apiUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw createEmailServiceUnavailableError();
  }

  if (!response.ok) {
    throw createEmailServiceUnavailableError();
  }

  let messageId = null;
  try {
    const body = /** @type {{ messageId?: unknown }} */ (await response.json());
    if (typeof body?.messageId === 'string') {
      messageId = body.messageId;
    }
  } catch {
    // Non-JSON or empty 2xx response from provider is still a successful dispatch.
  }

  return { messageId };
}
