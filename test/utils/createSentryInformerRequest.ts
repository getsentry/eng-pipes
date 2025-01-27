import { Fastify } from '@/types';
import { createSignature } from '@/utils/auth/createSignature';

function createSentryInformerSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.SENTRY_INFORMER_WEBHOOK_SECRET,
    (i) => i,
    'sha256'
  );
}

export async function createSentryInformerRequest(
  fastify: Fastify,
  payload: any
) {
  const signature = createSentryInformerSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/sentry-informer/webhook',
    headers: {
      'x-sentry-informer-signature': signature.toString(),
    },
    payload: payload,
  });
}
