import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

import { typescript } from './brain/typescript';
import getProgress from './getProgress';

export function createSlack(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  typescript();

  server.get(
    '/stats',
    {},
    async (request: FastifyRequest, reply: FastifyReply<ServerResponse>) => {
      try {
        const data = await getProgress(request.query.date);
        reply.send(data);
      } catch (err) {
        console.error(err);
        reply.status(400).send(err);
      }
    }
  );

  done();
}
