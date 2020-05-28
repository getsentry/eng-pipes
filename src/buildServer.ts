import path from 'path';

import fastify, { FastifyInstance, FastifyReply } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

export function buildServer() {
  const server: FastifyInstance<
    Server,
    IncomingMessage,
    ServerResponse
  > = fastify({
    logger: { prettyPrint: process.env.NODE_ENV === 'development' },
  });

  server.register(require('fastify-formbody'));

  server.decorate(
    'notFound',
    (_request: fastify.FastifyRequest, reply: FastifyReply<ServerResponse>) => {
      reply
        .code(404)
        .type('text/html')
        .send('Not Found');
    }
  );

  server.setNotFoundHandler(server.notFound);

  server.get('/', {}, async () => {
    return 'Hello world';
  });

  server.post('/metrics/:service/webhook', {}, async (request, reply) => {
    const rootDir = __dirname;
    try {
      const handlerPath = path.join(
        __dirname,
        'handlers',
        'metrics',
        request.params.service
      );

      // Prevent directory traversals
      if (!handlerPath.startsWith(rootDir)) {
        throw new Error('Invalid service');
      }

      const { handler } = require(handlerPath);

      if (!handler) {
        throw new Error('Invalid service');
      }

      return handler(request, reply);
    } catch {
      return server.notFound(request, reply);
    }
  });

  server.post('/metrics/freight/webhook', {}, async request => {
    const payload = JSON.parse(request.body.payload);
    console.log(payload);
    return {};
  });

  return server;
}
