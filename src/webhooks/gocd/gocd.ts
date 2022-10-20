import { FastifyRequest } from 'fastify';

import { GoCDPayload } from '@types';

import { gocdevents } from '@api/gocdevents';

export async function handler(request: FastifyRequest<{ Body: GoCDPayload }>) {
  const { body }: { body: GoCDPayload } = request;
  gocdevents.emit(body.type, body.data);
  return {};
}
