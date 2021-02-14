import { createSlackEvent } from './createSlackEvent';

export async function createSlackMessage(fastify, text: string) {
  return await createSlackEvent(fastify, 'message', {
    text,
  });
}
