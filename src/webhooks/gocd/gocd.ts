import { FastifyRequest } from 'fastify';

import { gocdevents } from '~/api/gocdevents';
import { GoCDResponse } from '~/types';

export async function handler(request: FastifyRequest<{ Body: GoCDResponse }>) {
  const { body }: { body: GoCDResponse } = request;
  gocdevents.emit(body.type, body);
  return {};
}
