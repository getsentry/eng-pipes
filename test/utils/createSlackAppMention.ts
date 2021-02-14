import { createSlackEvent } from './createSlackEvent';

export async function createSlackAppMention(fastify, text: string) {
  return await createSlackEvent(fastify, 'app_mention', {
    text,
  });
}
