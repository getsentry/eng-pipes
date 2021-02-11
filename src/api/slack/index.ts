import { App, LogLevel } from '@slack/bolt';
import { WebClient } from '@slack/web-api';

import { SLACK_BOT_USER_ACCESS_TOKEN, SLACK_SIGNING_SECRET } from '@app/config';

// XXX(billy): Uhhh for some reason our normal bot token
// (for app Sentry Bot: https://api.slack.com/apps/ASUD2NK2S)
// does not work for fetching user profiles.
// Instead we are using DogBot: https://api.slack.com/apps/A0182D08F9T/oauth?
//
// I currently have a support ticket with slack about this
const web2 = new WebClient(process.env.SLACK_BOT_USER_ACCESS_TOKEN_TEMP);

const bolt = new App({
  token: SLACK_BOT_USER_ACCESS_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  endpoints: '/',
});

// We have to do this because the original client does not have a token associated with it
// This is to support multiple workspaces, see https://github.com/slackapi/bolt-js/issues/250
bolt.client = new WebClient(SLACK_BOT_USER_ACCESS_TOKEN);

export { web2, bolt };

// @ts-ignore
bolt.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  console.error(error);
});
