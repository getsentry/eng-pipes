import * as Sentry from '@sentry/node';
import { App, LogLevel } from '@slack/bolt';

import {
  SLACK_BOT_USER_ACCESS_TOKEN,
  SLACK_SIGNING_SECRET,
} from '~/src/config';

const bolt = new App({
  logLevel: LogLevel.INFO,
  token: SLACK_BOT_USER_ACCESS_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  endpoints: '/',
});

// We have to do this because the original client does not have a token associated with it
// This is to support multiple workspaces, see https://github.com/slackapi/bolt-js/issues/250
// @ts-ignore
bolt.client.token = SLACK_BOT_USER_ACCESS_TOKEN;

export { bolt };

// @ts-ignore
bolt.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  // @ts-ignore
  Sentry.captureException(error.original || error);

  if (process.env.NODE_ENV !== 'production') {
    // @ts-ignore
    console.error(`Slack error occurred: `, error);
  }
});
