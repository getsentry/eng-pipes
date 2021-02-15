import { IncomingMessage, Server, ServerResponse } from 'http';

import { FastifyInstance } from 'fastify';

export function createSlack(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  done();
}
