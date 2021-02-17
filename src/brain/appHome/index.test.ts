import { createSlackEvent } from '@test/utils/createSlackEvent';

import { buildServer } from '@/buildServer';
import { getUser } from '@api/getUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { appHome } from '.';

jest.mock('@api/getUser');

describe('appHome', function () {
  let fastify;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    appHome();
    // @ts-ignore
    bolt.client.views.publish.mockClear();
  });

  afterEach(async function () {
    fastify.close();
    await db('users').delete();
  });

  it('publishes the AppHome view for user that has GitHub username', async function () {
    await createSlackEvent(fastify, 'app_home_opened');

    expect(bolt.client.views.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'U018H4DA8N5',
        view: expect.objectContaining({
          type: 'home',
        }),
      })
    );

    //@ts-ignore
    expect(bolt.client.views.publish.mock.calls[0][0].view.blocks)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "text": Object {
            "text": "*Welcome home, <@U018H4DA8N5> :house:* - this is under :construction:",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "text": Object {
            "text": "Here you will find information about what I am capable of, as well as adjusting some of your options",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "text": Object {
            "emoji": true,
            "text": "Deploy Notifications (currently: on)",
            "type": "plain_text",
          },
          "type": "header",
        },
        Object {
          "elements": Array [
            Object {
              "action_id": "mute-slack-deploy",
              "confirm": Object {
                "confirm": Object {
                  "text": "Mute",
                  "type": "plain_text",
                },
                "deny": Object {
                  "text": "Cancel",
                  "type": "plain_text",
                },
                "text": Object {
                  "text": "Are you sure you want to mute these deploy notifications? You can re-enable them by DM-ing me

      \`\`\`
      deploy notifications on
      \`\`\`

      Or you can visit the App's \\"Home\\" tab in Slack.
      ",
                  "type": "mrkdwn",
                },
                "title": Object {
                  "text": "Mute deploy notifications?",
                  "type": "plain_text",
                },
              },
              "style": "danger",
              "text": Object {
                "emoji": true,
                "text": "Mute",
                "type": "plain_text",
              },
              "type": "button",
              "value": "mute",
            },
          ],
          "type": "actions",
        },
      ]
    `);
  });

  it('publishes the AppHome view for user that does not have GitHub username', async function () {
    //@ts-ignore
    getUser.mockImplementation(() => ({
      email: 'test@sentry.io',
      slackUser: 'U018H4DA8N5',
    }));
    await createSlackEvent(fastify, 'app_home_opened');

    expect(bolt.client.views.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'U018H4DA8N5',
        view: expect.objectContaining({
          type: 'home',
        }),
      })
    );

    //@ts-ignore
    expect(bolt.client.views.publish.mock.calls[0][0].view.blocks)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "text": Object {
            "text": "*Welcome home, <@U018H4DA8N5> :house:* - this is under :construction:",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "text": Object {
            "text": "Here you will find information about what I am capable of, as well as adjusting some of your options",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "text": Object {
            "text": "Enter your GitHub username below to get notifications when your changes are ready to deploy.",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "block_id": "github-login-input",
          "dispatch_action": true,
          "element": Object {
            "action_id": "set-github-login",
            "dispatch_action_config": Object {
              "trigger_actions_on": Array [
                "on_enter_pressed",
              ],
            },
            "placeholder": Object {
              "text": "Enter your GitHub username and press Enter to save",
              "type": "plain_text",
            },
            "type": "plain_text_input",
          },
          "label": Object {
            "text": "GitHub username",
            "type": "plain_text",
          },
          "type": "input",
        },
      ]
    `);
  });
});
