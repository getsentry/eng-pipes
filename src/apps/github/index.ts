import { IncomingMessage, Server, ServerResponse } from 'http';

import { FastifyInstance } from 'fastify';

export function createGithub(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  done();
}
