import '@sentry/tracing';

import { ServerResponse } from 'http';
import path from 'path';

import { RewriteFrames } from '@sentry/integrations';
import * as Sentry from '@sentry/node';
import fastify, { FastifyReply } from 'fastify';

import { Fastify } from '@types';

import { githubEvents } from '@api/github';
import { bolt } from '@api/slack';
import { loadBrain } from '@utils/loadBrain';

import { SENTRY_DSN } from './config';

export async function buildServer(
  logger: boolean | { prettyPrint: boolean } = {
    prettyPrint: process.env.NODE_ENV === 'development',
  }
) {
  const server: Fastify = fastify({
    logger,
  });

  // Only enable in production
  // if (process.env.ENV === 'production') {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.VERSION,
    environment: process.env.ENV,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),

      new RewriteFrames({ root: __dirname || process.cwd() }),
    ],
    tracesSampleRate: 1.0,
  });
  // }

  server.register(require('fastify-formbody'));

  server.decorate(
    'notFound',
    (_request: fastify.FastifyRequest, reply: FastifyReply<ServerResponse>) => {
      reply.code(404).type('text/html').send('Not Found');
    }
  );

  // @ts-ignore
  server.setNotFoundHandler(server.notFound);

  server.get('/', {}, async (request, reply) => {
    return '';
  });

  // Other webhook handlers
  server.post('/metrics/:service/webhook', {}, async (request, reply) => {
    const rootDir = __dirname;
    let handler;

    try {
      const handlerPath = path.join(
        __dirname,
        'apps',
        'webhooks',
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

  // Initializes slack apps
  // @ts-ignore
  server.use('/apps/slack/events', bolt.receiver.requestListener);
  // Use the GitHub webhooks middleware
  server.use('/metrics/github/webhook', githubEvents.middleware);

  // Brain = modules that listen to slack/github events
  await loadBrain();

  return server;
}
