import path from 'path';

import * as Sentry from '@sentry/node';
import fastify, { FastifyInstance, FastifyReply } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

import { githubEvents } from '@api/github';
import { slackEvents } from '@api/slack';

import { createSlack } from './handlers/apps/slack';
import { createGithub } from './handlers/apps/github';

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

  // @ts-ignore
  server.setNotFoundHandler(server.notFound);

  server.get('/', {}, async () => {
    return '';
  });

  // Slack middleware to listen to slack events
  server.use('/apps/slack/events', slackEvents.requestListener());
  // Initializes slack apps
  server.register(createSlack, { prefix: '/apps/slack' });

  // Use the GitHub webhooks middleware
  server.use('/metrics/github/webhook', githubEvents.middleware);
  server.register(createGithub, { prefix: '/apps/github' });

  server.post('/metrics/:service/webhook', {}, async (request, reply) => {
    const rootDir = __dirname;
    let handler;

    console.log('old route');
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
      // @ts-ignore
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
