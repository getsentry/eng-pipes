import fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import * as Sentry from '@sentry/node';
import { Server, IncomingMessage, ServerResponse } from 'http';

import { DEFAULT_PORT, SENTRY_DSN } from './config';
import { TravisPayload } from './types';

Sentry.init({
  dsn: SENTRY_DSN,
  release: process.env.VERSION,
});

const server: FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse
> = fastify({ logger: console });

const opts: RouteShorthandOptions = {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          pong: {
            type: 'string',
          },
        },
      },
    },
  },
};

server.register(require('fastify-formbody'));

server.post('/metrics/travis/webhook', {}, async request => {
  const travisSignature = Buffer.from(request.headers.signature, 'base64');
  console.log('signature', travisSignature);

  const { config, ...payload } = JSON.parse(
    request.body.payload
  ) as TravisPayload;

  console.log(payload);
  payload.matrix.forEach(({ config }) => console.log(config));
  console.log(config);

  return {};
});

server.post('/metrics/github/webhook', {}, async request => {
  const payload = JSON.parse(request.body.payload);

  console.log(payload);

  return {};
});

server.listen(Number(process.env.PORT) || DEFAULT_PORT, (err, address) => {
  if (err) {
    server.log.error(err);
    Sentry.captureException(err);
    process.exit(0);
  }
  server.log.info(`server listening on ${address}`);
});
