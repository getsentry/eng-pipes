import { FastifyRequest } from 'fastify';

import { GoCDResponse } from '@types';

import { gocdevents } from '@api/gocdevents';

export async function handler(request: FastifyRequest<{ Body: GoCDResponse }>) {
  const { body }: { body: GoCDResponse } = request;
  gocdevents.emit(body.type, body);
  return {};
}
