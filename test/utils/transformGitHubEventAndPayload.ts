import { EmitterWebhookEvent } from '@octokit/webhooks';
import merge from 'lodash.merge';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export function transformGitHubEventAndPayload<
  E extends EmitterWebhookEvent['name']
>(
  event: E,
  payload: DeepPartial<EmitterWebhookEvent<E>['payload']> | undefined
) {
  let defaultPayload;

  // Support sub-events, i.e., actions.
  event = event.split('.');
  const baseEvent = event[0];
  const action = event[1];
  event = null;

  try {
    defaultPayload = require(`@test/payloads/github/${baseEvent}`).default;
  } catch (err) {
    console.warn(`No payload found for event ${baseEvent}`);
  }

  if (action) {
    defaultPayload.action = action;
  }

  return [baseEvent, merge({}, defaultPayload, payload)];
}
