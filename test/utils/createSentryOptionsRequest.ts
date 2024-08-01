import { Fastify } from '@/types';
import { createSignature } from '@utils/createSignature';

function createSentryOptionsSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.SENTRY_OPTIONS_WEBHOOK_SECRET || '',
    (i) => i,
    'sha256'
  );
}

export async function createSentryOptionsRequest(
  fastify: Fastify,
  payload: Record<string, any>
) {
  const signature = createSentryOptionsSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/sentry-options/webhook',
    headers: {
      'x-sentry-options-signature': signature.toString(),
    },
    payload: payload,
  });
}
