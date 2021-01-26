import path from 'path';

import * as Sentry from '@sentry/node';
import fastify, { FastifyInstance, FastifyReply } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

import { slackEvents } from './api/slack';
import { createSlack } from './handlers/apps/slack';
import { requiredChecks } from './handlers/metrics/github/requiredChecks';

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
      reply.code(404).type('text/html').send('Not Found');
    }
  );

  server.setNotFoundHandler(server.notFound);

  server.get('/', {}, async () => {
    return 'Hello world';
  });

  server.get('/billy', {}, async () => {
    requiredChecks({ headers: {}, body: {} });
    return {};
  });

  server.use('/apps/slack/events', slackEvents.requestListener());
  server.register(createSlack, { prefix: '/apps/slack' });

  server.post('/metrics/:service/webhook', {}, async (request, reply) => {
    const rootDir = __dirname;
    let handler;

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

      ({ handler } = require(handlerPath));
      if (!handler) {
        throw new Error('Invalid service');
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err);
      return server.notFound(request, reply);
    }

    try {
      return await handler(request, reply);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err);
      return reply.code(400).send('Bad Request');
    }
  });

  return server;
}
