import { IncomingMessage, Server, ServerResponse } from 'http';

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ghaCancel } from './brain/gha-cancel';
import { typescript } from './brain/typescript';
import getProgress from './getProgress';

export function createSlack(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  typescript();
  ghaCancel();

  server.get(
    '/stats',
    {},
    async (request: FastifyRequest, reply: FastifyReply<ServerResponse>) => {
      try {
        const data = await getProgress({
          date: request.query.date,
        });
        reply.send(data);
      } catch (err) {
        console.error(err);
        reply.status(400).send(err);
      }
    }
  );

  done();
}
