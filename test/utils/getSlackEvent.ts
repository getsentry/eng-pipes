import merge from 'lodash.merge';

export function getSlackEvent(
  eventName: string,
  payload?: Record<string, any>
) {
  const eventPayload = require(`../payloads/slack/${eventName}.json`);
  return merge({ type: eventName }, eventPayload, payload);
}
