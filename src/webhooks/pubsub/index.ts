import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { ClientType } from '@/api/github/clientType';
import { GETSENTRY_ORG } from '@/config';
import { notifyProductOwnersForUntriagedIssues } from '@/webhooks/pubsub/slackNotifications';
import { getClient } from '@api/github/getClient';

import { triggerStaleBot } from './stalebot';

type PubSubPayload = {
  name: string;
  repos: string[];
  slo?: number;
};

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

export const pubSubHandler = async (
  request: FastifyRequest<{ Body: { message: { data: string } } }>,
  reply: FastifyReply
) => {
  const tx = Sentry.startTransaction({
    op: 'webhooks',
    name: 'pubsub.pubSubHandler',
  });
  const payload: PubSubPayload = JSON.parse(
    Buffer.from(request.body.message.data, 'base64').toString().trim()
  );

  let repos,
    octokit,
    now,
    code = 204;
  let func = new Map([
    ['stale-triage-notifier', notifyProductOwnersForUntriagedIssues],
    ['stale-bot', triggerStaleBot],
  ]).get(payload.name);

  if (func === undefined || !payload.repos || !payload.repos.length) {
    func = async () => {}; // no-op
    code = 400;
  } else {
    repos = payload.repos;
    octokit = await getClient(ClientType.App, GETSENTRY_ORG);
    now = moment().utc();
  }

  reply.code(code);
  reply.send(); // Respond early to not block the webhook sender
  await func(repos, octokit, now);
  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object
