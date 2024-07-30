import { Fastify } from '@/types';
import { createSignature } from '@utils/createSignature';

function createNotifierSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.INFRA_EVENT_NOTIFIER_WEBHOOK_SECRET,
    (i) => i,
    'sha256'
  );
}

export async function createNotifierRequest(fastify: Fastify, payload: any) {
  const signature = createNotifierSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/infra-event-notifier/webhook',
    headers: {
      'x-infra-event-notifier-signature': signature.toString(),
    },
    payload: payload,
  });
}
