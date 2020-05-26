import fastify, { FastifyInstance /*RouteShorthandOptions*/ } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

import { TravisPayload } from './types';
import { insert } from './db';
import { verifyTravisWebhook } from './verifyTravisWebhook';

export function buildServer() {
  const server: FastifyInstance<
    Server,
    IncomingMessage,
    ServerResponse
  > = fastify({
    logger: { prettyPrint: process.env.NODE_ENV === 'development' },
  });

  server.register(require('fastify-formbody'));

  server.get('/', {}, async () => {
    return 'Hello world';
  });

  server.post('/metrics/travis/webhook', {}, async request => {
    try {
      if (!(await verifyTravisWebhook(request))) {
        throw new Error('Could not verify Travis signature');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }

    const { config, ...payload } = JSON.parse(
      request.body.payload
    ) as TravisPayload;

    // Ignore non pull requests
    if (!payload.pull_request) {
      return;
    }

    await insert({
      source: 'travis',
      event: `build_${payload.state}`,
      object_id: payload.pull_request_number,
      source_id: payload.id,
      // `finished_at` is null when it has not completed yet
      start_timestamp: payload.started_at,
      end_timestamp: payload.finished_at,
      meta: {
        head_commit: payload.head_commit,
        base_commit: payload.base_commit,
        pull_request_title: payload.pull_request_title,
      },
    });

    // Also need to save matrix builds
    // Also ignore
    await Promise.all(
      payload.matrix.map(({ config, ...matrixPayload }) =>
        insert({
          source: 'travis',
          event: `build_${matrixPayload.state}`,
          object_id: payload.pull_request_number,
          source_id: matrixPayload.id,
          parent_id: matrixPayload.parent_id,
          // `finished_at` is null when it has not completed yet
          start_timestamp: matrixPayload.started_at,
          end_timestamp: matrixPayload.finished_at,
          meta: {
            name: config.name,
            head_commit: payload.head_commit,
            base_commit: payload.base_commit,
            pull_request_title: payload.pull_request_title,
          },
        })
      )
    );

    return {};
  });

  server.post('/metrics/github/webhook', {}, async request => {
    const payload = JSON.parse(request.body.payload);
    console.log(payload);
    return {};
  });

  server.post('/metrics/freight/webhook', {}, async request => {
    const payload = JSON.parse(request.body.payload);
    console.log(payload);
    return {};
  });

  return server;
}
