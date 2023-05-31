import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { ClientType } from '../../api/github/clientType';
import { getClient } from '../../api/github/getClient';
import { OWNER, SENTRY_REPO } from '../../config';
import { notifyProductOwnersForUntriagedIssues } from '../../webhooks/pubsub/slackNotifications';

import { triggerStaleBot } from './stalebot';

const DEFAULT_REPOS = [SENTRY_REPO];

type PubSubPayload = {
  name: string;
  slo?: number;
  repos?: string[];
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

  const repos: string[] = payload.repos || DEFAULT_REPOS;
  const octokit = await getClient(ClientType.App, OWNER);
  const now = moment().utc();

  // This is to make this endpoint accept different payloads and actions
  // in the future. Ideally, we'd then split out all different event
  // handlers into dedicated modules for clarity and isolation
  if (payload.name === 'stale-triage-notifier') {
    // Respond early to not block the webhook sender
    reply.code(204);
    reply.send();

    await notifyProductOwnersForUntriagedIssues(repos, octokit, now);
    tx.finish();

    return;
  } else if (payload.name === 'stale-bot') {
    // Respond early to not block the webhook sender
    reply.code(204);
    reply.send();

    await triggerStaleBot(repos, octokit, now);
    tx.finish();

    return;
  }

  reply.code(400);
  reply.send();

  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object
