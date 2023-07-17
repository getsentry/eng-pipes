import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { ClientType } from '@/api/github/clientType';
import { GH_APPS } from '@/config';
import { GitHubApp } from '@/config/loadGitHubAppsFromEnvironment';
import { getClient } from '@api/github/getClient';

import { notifyProductOwnersForUntriagedIssues } from './slackNotifications';
import { triggerStaleBot } from './stalebot';

type FunctionMap = Map<
  string,
  (x: GitHubApp, y: Octokit, z: moment.Moment) => any
>;

const DEFAULT_FUNCTION_MAP = new Map([
  ['stale-triage-notifier', notifyProductOwnersForUntriagedIssues],
  ['stale-bot', triggerStaleBot],
]);

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
  reply: FastifyReply,
  _funcMap: FunctionMap = DEFAULT_FUNCTION_MAP // for testing
) => {
  const tx = Sentry.startTransaction({
    op: 'webhooks',
    name: 'pubsub.pubSubHandler',
  });
  const payload: PubSubPayload = JSON.parse(
    Buffer.from(request.body.message.data, 'base64').toString().trim()
  );

  const func = _funcMap.get(payload.name);

  // `if (func)` is not enough to fool CodeQL.
  // https://codeql.github.com/codeql-query-help/javascript/js-unvalidated-dynamic-method-call/
  // https://github.com/github/codeql/tree/main/javascript/ql/src/Security/CWE-754/examples

  if (typeof func === 'function') {
    reply.code(204);
    reply.send(); // before real work to avoid blocking
    const now = moment().utc();
    for (const [org, app] of GH_APPS.apps) {
      const octokit = await getClient(ClientType.App, org);
      await func(app, octokit, now);
    }
  } else {
    reply.code(400);
    reply.send();
  }

  tx.finish();
};

// Test command for `sentry-docs` repo:
// curl -X POST 'http://127.0.0.1:3000/webhooks/pubsub' -H "Content-Type: application/json" -d '{"message": {"data": "eyJuYW1lIjoic3RhbGUtdHJpYWdlLW5vdGlmaWVyIiwicmVwb3MiOlsic2VudHJ5LWRvY3MiXX0="}}'
// `message.data` is a Base64-encoded JSON string that is a `PubSubPayload` object
