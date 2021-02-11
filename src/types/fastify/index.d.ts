import * as http from 'http';

import * as fastify from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance<
    HttpServer = http.Server,
    HttpRequest = http.IncomingMessage,
    HttpResponse = http.ServerResponse
  > {
    notFound(
      request: fastify.FastifyRequest,
      reply: fastify.FastifyReply
    ): void;
  }
}
