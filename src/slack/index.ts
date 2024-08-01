import path from 'path';

import * as Sentry from '@sentry/node';

// Code taken from src/webhooks/index.ts
export function SlackRouter(_server) {
  return async function (request, reply) {
    const rootDir = __dirname;
    let handler;

    try {
      const handlerPath = path.resolve(__dirname, request.params.service);

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
      reply.callNotFound();
      return;
    }

    try {
      return await handler(request, reply);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err);
      return reply.code(400).send('Bad Request');
    }
  };
}
