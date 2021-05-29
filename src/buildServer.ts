import { ServerResponse } from 'http';

import { RewriteFrames } from '@sentry/integrations';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { WebhookRouter } from '@webhooks';
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

  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.VERSION,
    environment: process.env.ENV || 'development',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Postgres(),
      new RewriteFrames({ root: __dirname || process.cwd() }),
    ],
    tracesSampleRate: 1.0,
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

  server.get('/', {}, async (request, reply) => {
    return '';
  });

  // Install Slack and GitHub handlers. Both the Bolt and @octokit/webhooks
  // libraries operate as middleware that emit events corresponding to webhook
  // POSTs. Our event handlers for both are under loadBrain.
  // @ts-ignore
  server.use('/apps/slack/events', bolt.receiver.requestListener);
  server.use('/webhooks/github', githubEvents.middleware);
  await loadBrain();

  // Other webhooks operate as regular Fastify handlers (albeit routed to
  // filesystem/module-space based on service name) rather than through a
  // middleware/event abstraction layer.
  server.post('/metrics/:service/webhook', {}, WebhookRouter(server));

  return server;
}
