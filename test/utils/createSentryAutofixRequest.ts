import { Fastify } from '@/types';
import { createSignature } from '@/utils/auth/createSignature';

function createSentryAutofixSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.SENTRY_AUTOFIX_WEBHOOK_SECRET || '',
    (i) => i,
    'sha256'
  );
}

export async function createSentryAutofixRequest(
  fastify: Fastify,
  payload: Record<string, any>
) {
  const signature = createSentryAutofixSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/sentry-autofix/webhook',
    headers: {
      'sentry-hook-signature': signature.toString(),
    },
    payload: payload,
  });
}
