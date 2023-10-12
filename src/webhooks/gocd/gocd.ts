import { FastifyRequest } from 'fastify';

import { gocdevents } from '~/src/api/gocdevents';
import { GoCDResponse } from '~/src/types';

export async function handler(request: FastifyRequest<{ Body: GoCDResponse }>) {
  const { body }: { body: GoCDResponse } = request;
  gocdevents.emit(body.type, body);
  return {};
}
