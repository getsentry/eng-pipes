import {
    FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
  } from '@/config';

import { FastifyRequest } from 'fastify';

import { OptionsAutomatorResponse } from '@types';

import { bolt } from '@/api/slack';
import { toString } from 'lodash';

//import { ChatPostMessageArguments } from '@slack/web-api';

export async function handler(request: FastifyRequest<{ Body: OptionsAutomatorResponse }>) {
    const { body }: { body: OptionsAutomatorResponse } = request;
    console.log('hi', body);
    
    await messageSlack(body);
    return {};

}

export async function messageSlack(message : OptionsAutomatorResponse) {    
    const parsed = toString(message);
    try {
    // @ts-ignore
    return await bolt.client.chat.postMessage({
        text: parsed,
        channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
        unfurl_links: false
    });
    } catch (err) {
        console.log(err);
        return;
    }
}
