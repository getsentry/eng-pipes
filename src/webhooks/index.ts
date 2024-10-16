import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { Fastify } from '@/types';

import { bootstrapWebhook } from './bootstrap-dev-env/bootstrap-dev-env';
import { gocdWebhook } from './gocd/gocd';
import { kafkactlWebhook } from './kafka-control-plane/kafka-control-plane';
import { sentryOptionsWebhook } from './sentry-options/sentry-options';
import { webpackWebhook } from './webpack/webpack';

type WebhookHandler = (
  request: FastifyRequest<any>,
  reply: FastifyReply
) => Promise<void>;

// Error handling wrapper function
export async function handleRoute(
  handler: WebhookHandler,
  request: FastifyRequest,
  reply: FastifyReply,
  name: string
): Promise<void> {
  const tx = Sentry.startTransaction({
    op: 'webhooks',
    name: 'webhooks.' + name,
  });
  try {
    await handler(request, reply);
  } catch (err) {
    Sentry.captureException(err);
    reply.code(400).send('Bad Request');
    tx.setHttpStatus(400);
  }
  tx.finish();
}

// Function that maps routes to their respective handlers
export async function routeHandlers(server: Fastify, _options): Promise<void> {
  server.post('/metrics/bootstrap-dev-env/webhook', (request, reply) =>
    handleRoute(bootstrapWebhook, request, reply, 'bootstrap-dev-env')
  );
  server.post('/metrics/gocd/webhook', (request, reply) =>
    handleRoute(gocdWebhook, request, reply, 'gocd')
  );
  server.post('/metrics/kafka-control-plane/webhook', (request, reply) =>
    handleRoute(kafkactlWebhook, request, reply, 'kafka-control-plane')
  );
  server.post('/metrics/sentry-options/webhook', (request, reply) =>
    handleRoute(sentryOptionsWebhook, request, reply, 'sentry-options')
  );
  server.post('/metrics/webpack/webhook', (request, reply) =>
    handleRoute(webpackWebhook, request, reply, 'webpack')
  );

  // Default handler for invalid routes
  server.all('/metrics/*/webhook', async (request, reply) => {
    const err = new Error('Invalid service');
    console.error(err);
    Sentry.captureException(err);
    reply.callNotFound();
  });
}
