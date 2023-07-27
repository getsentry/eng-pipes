import { FastifyRequest } from 'fastify';

import { OptionsAutomatorResponse } from '@types';

import { ChatPostMessageArguments } from '@slack/web-api';
import * as Sentry from '@sentry/node';

export async function handler(request: FastifyRequest<{ Body: OptionsAutomatorResponse }>) {
  const { body }: { body: OptionsAutomatorResponse } = request;
  
  return {};
}

export async function messageSlack(slack_channel: string, message : ChatPostMessageArguments) {    
    try {
    // @ts-ignore
    return await bolt.client.chat.postMessage({
        ...message,
        channel: slack_channel,
    });
    } catch (err) {
        Sentry.setContext('message', message);
        Sentry.captureException(err);
        return;
    }
}
