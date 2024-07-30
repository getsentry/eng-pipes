import { createHmac } from 'crypto';

import { FastifyRequest } from 'fastify';

export async function verifyEndpoint(request: FastifyRequest) {
  const SECRET_KEY = process.env.HMAC_SECRET_KEY ?? '';

  const hmac = createHmac('sha256', SECRET_KEY);
  hmac.update(JSON.stringify(request.body), 'utf8');
  const digest = hmac.digest('hex');
  return digest === request.headers['x-hmac-signature'];
}
