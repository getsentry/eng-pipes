import { EmitterWebhookEvent } from '@octokit/webhooks';
import merge from 'lodash.merge';

import { Fastify } from '@types';

import { createSignature } from '@utils/createSignature';

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

  const signature = createSignature(
    JSON.stringify(fullPayload),
    process.env.GH_WEBHOOK_SECRET || '',
    (i) => `sha1=${i}`
  ).toString();

  return await fastify.inject({
    method: 'POST',
    url: '/webhooks/github',
    headers: {
      'x-github-delivery': 1234,
      'x-github-event': baseEvent as string,
      'x-hub-signature': signature,
    },
    payload: fullPayload,
  });
}

export function hydrateGitHubEventAndPayload<
  E extends EmitterWebhookEvent['name']
>(
  event: E,
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
