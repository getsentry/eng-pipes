import { ChatPostMessageArguments } from '@slack/web-api';

import { bolt } from '@api/slack';
import { getUserPreferences } from '@utils/db/getUserPreferences';

type GetUserParams = {
  email?: string;
  slack?: string;
  github?: string;
};

/**
 * Attempts to message a user on Slack. This checks the user's notification preferences first
 */
export async function slackMessageUser(
  slackUser: string,
  message: Omit<ChatPostMessageArguments, 'channel'>
) {
  // Check user preference first
  const user = await getUserPreferences({ slackUser });

  if (user?.preferences.disableSlackNotifications) {
    return;
  }

  // @ts-ignore
  return await bolt.client.chat.postMessage({
    ...message,
    channel: slackUser,
  });
}
