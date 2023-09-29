import { KnownBlock } from '@slack/bolt';

import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { unmuteDeployNotificationsButton } from '@/blocks/unmuteDeployNotificationsButton';
import { getUser } from '@api/getUser';
import { bolt } from '@api/slack';

export async function updateAppHome(slackUser: string) {
  // Listen for users opening your App Home
  const user = await getUser({
    slackUser,
  });

  const disableSlackNotifications =
    user?.preferences?.disableSlackNotifications;

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Welcome home, <@${slackUser}> :house:*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Here you will find information about what I am capable of, as well as adjusting some of your options',
      },
    },
  ];

  // If user has a known github login, then show deploy notification prefs
  if (user?.githubUser) {
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Deploy Notifications (currently: ${
          disableSlackNotifications ? 'off' : 'on'
        })`,
        emoji: true,
      },
    });
    blocks.push({
      type: 'actions',
      elements: [
        disableSlackNotifications
          ? unmuteDeployNotificationsButton()
          : muteDeployNotificationsButton(),
      ],
    });
  } else {
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Enter your GitHub username below to get notifications when your changes are ready to deploy.',
        },
      },
      {
        type: 'input',
        block_id: 'github-login-input',
        dispatch_action: true,
        label: {
          type: 'plain_text',
          text: 'GitHub username',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'set-github-login',
          placeholder: {
            type: 'plain_text',
            text: 'Enter your GitHub username and press Enter to save',
          },
          dispatch_action_config: {
            trigger_actions_on: ['on_enter_pressed'],
          },
        },
      }
    );
  }

  await bolt.client.views.publish({
    // Use the user ID associated with the event
    user_id: slackUser,
    view: {
      // Home tabs must be enabled in your app configuration page under "App Home"
      type: 'home',
      blocks,
    },
  });
}
