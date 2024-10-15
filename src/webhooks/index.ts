import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { Fastify } from '@/types';

import { bootstrapWebhook } from './bootstrap-dev-env/bootstrap-dev-env';
import { gocdWebhook } from './gocd/gocd';
import { kafkactlWebhook } from './kafka-control-plane/kafka-control-plane';
import { sentryOptionsWebhook } from './sentry-options/sentry-options';
import { webpackWebhook } from './webpack/webpack';

// Error handling wrapper function
export async function handleRoute(
  handler,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await handler(request, reply);
  } catch (err) {
    console.error(err);
    Sentry.captureException(err);
    reply.code(400).send('Bad Request');
    return;
  }
}

// Function that maps routes to their respective handlers
export async function routeHandlers(server: Fastify, _options): Promise<void> {
  server.post('/metrics/bootstrap-dev-env/webhook', (request, reply) =>
    handleRoute(bootstrapWebhook, request, reply)
  );
  server.post('/metrics/gocd/webhook', (request, reply) =>
    handleRoute(gocdWebhook, request, reply)
  );
  server.post('/metrics/kafka-control-plane/webhook', (request, reply) =>
    handleRoute(kafkactlWebhook, request, reply)
  );
  server.post('/metrics/sentry-options/webhook', (request, reply) =>
    handleRoute(sentryOptionsWebhook, request, reply)
  );
  server.post('/metrics/webpack/webhook', (request, reply) =>
    handleRoute(webpackWebhook, request, reply)
  );

  // Default handler for invalid routes
  server.all('/metrics/*/webhook', async (request, reply) => {
    const err = new Error('Invalid service');
    console.error(err);
    Sentry.captureException(err);
    reply.callNotFound();
  });
}
