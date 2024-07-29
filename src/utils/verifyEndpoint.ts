import { createHmac } from 'crypto';

import { FastifyReply, FastifyRequest } from 'fastify';

function verifySignature(request: FastifyRequest, secret = '') {
  const hmac = createHmac('sha256', secret);
  hmac.update(JSON.stringify(request.body), 'utf8');
  const digest = hmac.digest('hex');
  return digest === request.headers['x-hmac-signature'];
}

export async function verifyEndpoint(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const SECRET_KEY = process.env.HMAC_SECRET_KEY ?? '';

  if (!verifySignature(request, SECRET_KEY)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  return;
}

export async function verifyPubSubEndpoint(
  request: FastifyRequest<{ Body: { message: { data: string } } }>,
  reply: FastifyReply
) {
  const SECRET_KEY = process.env.HMAC_SECRET_KEY ?? '';

  if (!verifySignature(request, SECRET_KEY)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  return;
}
