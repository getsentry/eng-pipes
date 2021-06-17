import path from 'path';

import * as Sentry from '@sentry/node';

/**
 * Return a function that routes webhook POSTs to this or that module
 * based on the service name.
 */

export function WebhookRouter(server) {
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
  };
}
