import {
    FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
  } from '@/config';

import { FastifyRequest } from 'fastify';

import { OptionsAutomatorResponse } from '@types';

import { bolt } from '@/api/slack';

//import { ChatPostMessageArguments } from '@slack/web-api';
import * as Sentry from '@sentry/node';

export async function handler(request: FastifyRequest<{ Body: OptionsAutomatorResponse }>) {
    const { body }: { body: OptionsAutomatorResponse } = request;
    console.log('hi', body);
    
    await messageSlack('hello');
    return {};

}

export async function messageSlack(message : string) {    
    try {
    // @ts-ignore
    return await bolt.client.chat.postMessage({
        text: message,
        channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
        unfurl_links: false
    });
    } catch (err) {
        console.log('we broke', err);
        Sentry.captureException(err);
        return;
    }
}
