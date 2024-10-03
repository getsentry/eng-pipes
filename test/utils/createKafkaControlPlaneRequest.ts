import { Fastify } from '@/types';
import { createSignature } from '@/utils/auth/createSignature';

function createKCPSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.KAFKA_CONTROL_PLANE_WEBHOOK_SECRET,
    (i) => i,
    'sha256'
  );
}

export async function createKCPRequest(fastify: Fastify, payload: any) {
  const signature = createKCPSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/kafka-control-plane/webhook',
    headers: {
      'x-infra-event-notifier-signature': signature.toString(),
    },
    payload: payload,
  });
}
