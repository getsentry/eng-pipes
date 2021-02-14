import merge from 'lodash.merge';

export function getSlackEvent(eventName: string, payload: Record<string, any>) {
  const eventPayload = require(`@test/payloads/slack/${eventName}.json`);

  if (!eventPayload) {
    throw new Error(`Payload not found: @test/payloads/slack/${eventName}`);
  }

  return merge(eventPayload, payload);
}
