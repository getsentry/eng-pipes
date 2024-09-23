import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from '@octokit/webhooks';
import merge from 'lodash.merge';

import { Fastify } from '@types';

import { githubEvents } from '@/api/github';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export async function createGitHubEvent<E extends EmitterWebhookEvent['name']>(
  fastify: Fastify,
  event: E,
  payload?: DeepPartial<EmitterWebhookEvent<E>['payload']>
) {
  const { event: baseEvent, payload: fullPayload } =
    hydrateGitHubEventAndPayload<E>(event, payload);

  return await fastify.inject({
    method: 'POST',
    url: '/webhooks/github',
    headers: {
      'x-github-delivery': 1234,
      'x-github-event': baseEvent as string,
      'x-hub-signature-256': await githubEvents.sign(
        JSON.stringify(fullPayload)
      ),
    },
    payload: fullPayload,
  });
}

export function hydrateGitHubEventAndPayload<
  E extends EmitterWebhookEvent['name']
>(
  event: EmitterWebhookEventName,
  payload: DeepPartial<EmitterWebhookEvent<E>['payload']> | undefined
) {
  let defaultPayload;

  // Support sub-events, i.e., actions.
  const [baseEvent, action] = event.split('.');

  try {
    defaultPayload = require(`@test/payloads/github/${baseEvent}`).default;
  } catch (err) {
    console.warn(`No payload found for event ${baseEvent}`);
  }

  if (action) {
    defaultPayload.action = action;
  }

  return { event: baseEvent, payload: merge({}, defaultPayload, payload) };
}
