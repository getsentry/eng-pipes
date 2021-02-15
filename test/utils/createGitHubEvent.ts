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
  let defaultPayload;
  try {
    defaultPayload = require(`@test/payloads/github/${event}`).default;
  } catch (err) {
    console.warn(`No payload found for event ${event}`);
  }

  const fullPayload = merge(defaultPayload, payload);

  const signature = createSignature(
    JSON.stringify(fullPayload),
    process.env.GH_WEBHOOK_SECRET || '',
    (i) => `sha1=${i}`
  ).toString();

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/github/webhook',
    headers: {
      'x-github-delivery': 1234,
      'x-github-event': event as string,
      'x-hub-signature': signature,
    },
    payload: fullPayload,
  });
}
