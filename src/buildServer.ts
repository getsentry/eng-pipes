import { createNodeMiddleware } from '@octokit/webhooks';
import { RewriteFrames } from '@sentry/integrations';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { WebhookRouter } from '@webhooks';
import fastify from 'fastify';
import fastifyFormBody from 'fastify-formbody';
import middie from 'middie';

import { Fastify } from '@types';

import { githubEvents } from '@api/github';
import { bolt } from '@api/slack';
import { loadBrain } from '@utils/loadBrain';

import { verifyEndpoint } from './utils/verifyEndpoint';
import * as PubSub from './webhooks/pubsub';
import { SENTRY_DSN } from './config';

export async function buildServer(
  logger: boolean | { prettyPrint: boolean } = {
    prettyPrint: process.env.NODE_ENV === 'development',
  }
) {
  const server: Fastify = fastify({
    logger,
    disableRequestLogging: true,
  });

  await server.register(middie);
  await server.register(fastifyFormBody);

  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.VERSION,
    environment: process.env.ENV || 'development',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Postgres(),
      new RewriteFrames({ root: process.cwd() }),
    ],
    tracesSampleRate: 1.0,
    normalizeDepth: 6,
  });

  // For Sentry Release Health
  // https://docs.sentry.io/platforms/node/configuration/releases/
  server.use(Sentry.Handlers.requestHandler());

  server.setErrorHandler((error, request, reply) => {
    // Log to console when not in production environment
    if (process.env.ENV !== 'production') {
      console.error(error);
    }
    Sentry.captureException(error);
    reply.code(500).send();
  });

  server.setNotFoundHandler(
    // Note: The preValidation hook registered using this method will run for a
    // route that Fastify does not recognize and not when a route handler
    // manually calls reply.callNotFound. In which case, only preHandler will be
    // run.
    {
      preValidation: (req, reply, done) => {
        done();
      },
      preHandler: (req, reply, done) => {
        done();
      },
    },
    function (request, reply) {
      // Default not found handler with preValidation and preHandler hooks
      reply.code(404).type('text/html').send('Not Found');
    }
  );

  server.get('/', {}, async (_request, _reply) => {
    return '';
  });

  // Install Slack and GitHub handlers. Both the Bolt and @octokit/webhooks
  // libraries operate as middleware that emit events corresponding to webhook
  // POSTs. Our event handlers for both are under loadBrain.
  // @ts-expect-error
  server.use('/apps/slack/events', bolt.receiver.requestListener);
  server.use(
    '/webhooks/github',
    createNodeMiddleware(githubEvents, { path: '/' })
  );
  await loadBrain();

  // Other webhooks operate as regular Fastify handlers (albeit routed to
  // filesystem/module-space based on service name) rather than through a
  // middleware/event abstraction layer.
  server.post<{ Params: { service: string } }>(
    '/metrics/:service/webhook',
    {},
    WebhookRouter(server)
  );

  // Endpoint for Google PubSub events
  // TODO: Unify all these webhooks URL patterns!
  server.post('/webhooks/pubsub', PubSub.opts, PubSub.pubSubHandler);

  return server;
}
