import { FastifyRequest } from 'fastify';

import { FreightPayload } from '@types';
// import { insert } from '@utils/db';

export async function handler(request: FastifyRequest) {
  const payload = JSON.parse(request.body.payload) as FreightPayload;

  console.log(payload);

  return {};
}
