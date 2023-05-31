import * as Sentry from '@sentry/node';
import { ChatPostMessageArguments } from '@slack/web-api';

import { getUser } from '../getUser';
import { bolt } from '../slack';

/**
 * Attempts to message a user on Slack. This checks the user's notification preferences first
 */
export async function slackMessageUser(
  slackUser: string,
  message: Omit<ChatPostMessageArguments, 'channel'>
) {
  // Check user preference first
  const user = await getUser({ slackUser });

  if (user?.preferences.disableSlackNotifications) {
    return;
  }

  try {
    // @ts-ignore
    return await bolt.client.chat.postMessage({
      ...message,
      unfurl_links: false,
      channel: slackUser,
    });
  } catch (err) {
    Sentry.setContext('message', message);
    Sentry.captureException(err);
    return;
  }
}
