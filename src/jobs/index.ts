import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import moment from 'moment-timezone';

import { GH_ORGS } from '@/config';
import { Fastify } from '@/types';

import { notifyProductOwnersForUntriagedIssues } from '../webhooks/pubsub/slackNotifications';

import { triggerPausedPipelineBot } from './gocdPausedPipelineBot';
import { triggerSlackScores } from './slackScores';
import { triggerStaleBot } from './stalebot';

// Error handling wrapper function
// Additionally handles Auth from Cloud Scheduler
export async function handleJobRoute(
  handler,
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const client = new OAuth2Client();
    // Get the Cloud Scheduler JWT in the "Authorization" header.
    const bearer = request.headers.authorization || '';

    if (!bearer) {
      reply.code(400);
      reply.send();
      return;
    }

    const match = bearer.match(/Bearer (.*)/);

    if (!match) {
      reply.code(400);
      reply.send();
      return;
    }

    const token = match[1];

    // Verify and decode the JWT.
    // Note: For high volume push requests, it would save some network
    // overhead if you verify the tokens offline by decoding them using
    // Google's Public Cert; caching already seen tokens works best when
    // a large volume of messages have prompted a single push server to
    // handle them, in which case they would all share the same token for
    // a limited time window.
    await client.verifyIdToken({
      idToken: token,
    });
  } catch (e) {
    reply.code(401);
    reply.send();
    return;
  }
  const tx = Sentry.startTransaction({
    op: 'webhooks',
    name: 'jobs.jobsHandler',
  });

  const func = async () => {
    const now = moment().utc();
    for (const org of GH_ORGS.orgs.values()) {
      handler(org, now);
    }
  };

  reply.code(204);
  reply.send(); // Respond early to not block the webhook sender
  await func();
  tx.finish();
}

export const opts = {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'string',
            },
          },
        },
      },
    },
  },
};

// Function that creates a sub fastify server for job webhooks
export async function routeJobs(server: Fastify, _options) {
  server.post('/stale-triage-notifier', (request, reply) =>
    handleJobRoute(notifyProductOwnersForUntriagedIssues, request, reply)
  );
  server.post('/stale-bot', (request, reply) =>
    handleJobRoute(triggerStaleBot, request, reply)
  );
  server.post('/slack-scores', (request, reply) =>
    handleJobRoute(triggerSlackScores, request, reply)
  );
  server.post('/gocd-paused-pipeline-bot', (request, reply) =>
    handleJobRoute(triggerPausedPipelineBot, request, reply)
  );

  // Default handler for invalid routes
  server.all('/*', async (_request, reply) => {
    const err = new Error('Invalid service');
    console.error(err);
    Sentry.captureException(err);
    reply.callNotFound();
  });
}
