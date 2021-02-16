import merge from 'lodash.merge';

export function getSlackEvent(
  eventName: string,
  payload?: Record<string, any>
) {
  let eventPayload;

  try {
    eventPayload = require(`@test/payloads/slack/${eventName}.json`);
  } catch {
    // ignore errors as we can have simple events
  }

  return merge({ type: eventName }, eventPayload, payload);
}
