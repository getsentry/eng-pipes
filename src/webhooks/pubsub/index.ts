import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { GH_ORGS } from '@/config';

import { notifyProductOwnersForUntriagedIssues } from './slackNotifications';
import { triggerStaleBot } from './stalebot';

type PubSubPayload = {
  name: string;
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

  let code, func;
  const operation = new Map([
    ['stale-triage-notifier', notifyProductOwnersForUntriagedIssues],
    ['stale-bot', triggerStaleBot],
  ]).get(payload.name);

  if (operation) {
    code = 204;
    func = async () => {
      const now = moment().utc();
      for (const org of GH_ORGS.orgs.values()) {
        // Performing the following check seems to suppress GitHub's dynamic method
        // call security warning (as well as a Typescript error).
        // https://codeql.github.com/codeql-query-help/javascript/js-unvalidated-dynamic-method-call/
        if (typeof operation === 'function') {
          operation(org, now);
        }
      }
    };
  } else {
    code = 400;
    func = async () => {}; // no-op
  }

  reply.code(code);
  reply.send(); // Respond early to not block the webhook sender
  await func();
  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object
