import { createEventAdapter } from '@slack/events-api';
import { WebClient } from '@slack/web-api';

import { SLACK_BOT_USER_ACCESS_TOKEN, SLACK_SIGNING_SECRET } from '@app/config';

const token = process.env.SLACK_ACCESS_TOKEN || '';
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET || '';

const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET);
const web = new WebClient(SLACK_BOT_USER_ACCESS_TOKEN);

// XXX(billy): Uhhh for some reason our normal bot token
// (for app Sentry Bot: https://api.slack.com/apps/ASUD2NK2S)
// does not work for fetching user profiles.
// Instead we are using DogBot: https://api.slack.com/apps/A0182D08F9T/oauth?
//
// I currently have a support ticket with slack about this
const web2 = new WebClient(process.env.SLACK_BOT_USER_ACCESS_TOKEN_TEMP);

export { web, web2, slackEvents };
