import merge from 'lodash.merge';

import { createGitHubEvent } from '@test/utils/createGitHubEvent';
import { createSlackRequest } from '@test/utils/createSlackRequest';

import { buildServer } from '@/buildServer';
import { REQUIRED_CHECK_NAME } from '@/config';
import { Fastify } from '@/types';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { getLastSuccessfulDeploy } from '@utils/db/getLastSuccessfulDeploy';

import * as actions from './actionViewUndeployedCommits';
import { pleaseDeployNotifier } from '.';

describe('pleaseDeployNotifier', function () {
  let fastify: Fastify;
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
    jest.spyOn(actions, 'actionViewUndeployedCommits');

    pleaseDeployNotifier();
    octokit = await getClient('getsentry');
    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
            commit: {
              author: {
                name: 'mars',
                email: 'mars@sentry.io',
                date: '2021-02-03T11:06:46Z',
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2021-02-03T11:06:46Z',
              },
              message:
                'feat(ui): Change default period for fresh releases (#23572)\n' +
                '\n' +
                'The fresh releases (not older than one day) will have default statsPeriod on the release detail page set to 24 hours.',
            },
          }),
        };
      }

      return { data: defaultPayload };
    });
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    octokit.repos.compareCommits.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
    await db('deploys').delete();
  });

  it('ignores check run in progress', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'in_progress',
        conclusion: null,
        name: REQUIRED_CHECK_NAME,
      },
    });
    expect(bolt.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('ignores failed conclusions', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
      },
    });
    expect(bolt.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('notifies slack user when check run is successful', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: 'All checks passed',
          summary: 'All checks passed',
          text:
            '\n' +
            '# Required Checks\n' +
            '\n' +
            'These are the jobs that must pass before this commit can be deployed. Try re-running a failed job in case it is flakey.\n' +
            '\n' +
            '## Status of required checks\n' +
            '\n' +
            '| Job | Conclusion |\n' +
            '| --- | ---------- |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(2);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text:
          'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
      })
    );

    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[0][0].attachments)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*feat(ui): Change default period for fresh releases (#23572)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "The fresh releases (not older than one day) will have default statsPeriod on the release detail page set to 24 hours.",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "mars",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|mars (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "freight-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "https://freight.getsentry.net/deploy?app=getsentry",
                  "value": "6d225cb77225ac655d817a7551a26fff85090fe6",
                },
                Object {
                  "action_id": "view-undeployed-commits-",
                  "text": Object {
                    "emoji": true,
                    "text": "View Undeployed Commits",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "6d225cb77225ac655d817a7551a26fff85090fe6",
                },
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
          ],
          "color": "#C6BECF",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('has a button to view undeployed commits in a modal if there is a successful deploy in db', async function () {
    await db('deploys').insert({
      external_id: 1,
      user_id: 1,
      app_name: 'getsentry',
      user: 'test@sentry.io',
      ref: 'master',
      sha: '999999',
      previous_sha: '888888',
      environment: 'production',
      status: 'finished',
    });
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: 'All checks passed',
          summary: 'All checks passed',
          text:
            '\n' +
            '# Required Checks\n' +
            '\n' +
            'These are the jobs that must pass before this commit can be deployed. Try re-running a failed job in case it is flakey.\n' +
            '\n' +
            '## Status of required checks\n' +
            '\n' +
            '| Job | Conclusion |\n' +
            '| --- | ---------- |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[0][0].attachments)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*feat(ui): Change default period for fresh releases (#23572)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "The fresh releases (not older than one day) will have default statsPeriod on the release detail page set to 24 hours.",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "mars",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|mars (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "freight-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "https://freight.getsentry.net/deploy?app=getsentry",
                  "value": "6d225cb77225ac655d817a7551a26fff85090fe6",
                },
                Object {
                  "action_id": "view-undeployed-commits-",
                  "text": Object {
                    "emoji": true,
                    "text": "View Undeployed Commits",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "6d225cb77225ac655d817a7551a26fff85090fe6",
                },
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
          ],
          "color": "#C6BECF",
        },
      ]
    `);

    // Mock user clicking "view undeployed commits"
    octokit.repos.getCommit.mockClear();
    await createSlackRequest(fastify, 'block_actions', {
      type: 'block_actions',
      user: {
        id: 'U018H4DA8N5',
        username: 'billy',
        name: 'billy',
        team_id: 'T018UAQ7YRW',
      },
      api_app_id: 'A017XPC80S2',
      token: 'jPgd8YIi2F0O0IicFgxLzUNv',
      container: {
        type: 'message_attachment',
        message_ts: '1614650305.001000',
        attachment_id: 1,
        channel_id: 'G018X8Y9B1N',
        is_ephemeral: false,
        is_app_unfurl: false,
      },
      trigger_id:
        '1815328135908.1300364270880.5e3ef7206bc9e21fa1feb2e5de3d7d3a',
      team: {
        id: 'T018UAQ7YRW',
        domain: 'sentrydogdev',
      },
      enterprise: null,
      is_enterprise_install: false,
      channel: {
        id: 'G018X8Y9B1N',
        name: 'privategroup',
      },
      message: {
        bot_id: 'B01834PAJDT',
        type: 'message',
        text:
          'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/455e3db9eb4fa6a1789b70e4045b194f02db0b59|455e3db> is ready to deploy',
        user: 'U018UAXJVG8',
        ts: '1614650305.001000',
        team: 'T018UAQ7YRW',
        attachments: [
          {
            id: 1,
            blocks: [
              {
                type: 'section',
                block_id: '37v',
                text: {
                  type: 'mrkdwn',
                  text:
                    '<https://github.com/getsentry/getsentry/commit/455e3db9eb4fa6a1789b70e4045b194f02db0b59|*fix(workflow): Fix inbox experiment test orgs (#5179)*>',
                  verbatim: false,
                },
              },
              {
                type: 'section',
                block_id: 'JXt',
                text: {
                  type: 'mrkdwn',
                  text: '_&lt;empty commit message&gt;_',
                  verbatim: false,
                },
              },
              {
                type: 'context',
                block_id: 'iG3',
                elements: [
                  {
                    type: 'image',
                    image_url:
                      'https://avatars.githubusercontent.com/u/1400464?v=4',
                    alt_text: 'Scott Cooper',
                  },
                  {
                    type: 'mrkdwn',
                    text:
                      '<https://github.com/scttcper|Scott Cooper (scttcper)>',
                    verbatim: false,
                  },
                ],
              },
              {
                type: 'actions',
                block_id: 'TvwVk',
                elements: [
                  {
                    type: 'button',
                    action_id: 'freight-deploy',
                    text: {
                      type: 'plain_text',
                      text: 'Deploy',
                      emoji: true,
                    },
                    style: 'primary',
                    value: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
                    url: 'https://freight.getsentry.net/deploy?app=getsentry',
                  },
                  {
                    type: 'button',
                    action_id: 'view-undeployed-commits-',
                    text: {
                      type: 'plain_text',
                      text: 'View Undeployed Commits',
                      emoji: true,
                    },
                    value: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
                  },
                  {
                    type: 'button',
                    action_id: 'mute-slack-deploy',
                    text: {
                      type: 'plain_text',
                      text: 'Mute',
                      emoji: true,
                    },
                    style: 'danger',
                    value: 'mute',
                    confirm: {
                      title: {
                        type: 'plain_text',
                        text: 'Mute deploy notifications?',
                        emoji: true,
                      },
                      text: {
                        type: 'mrkdwn',
                        text:
                          'Are you sure you want to mute these deploy notifications? You can re-enable them by DM-ing me\n\n```\ndeploy notifications on\n```\n\nOr you can visit the App\'s "Home" tab in Slack.\n',
                        verbatim: false,
                      },
                      confirm: {
                        type: 'plain_text',
                        text: 'Mute',
                        emoji: true,
                      },
                      deny: {
                        type: 'plain_text',
                        text: 'Cancel',
                        emoji: true,
                      },
                    },
                  },
                ],
              },
            ],
            color: '#C6BECF',
            fallback: '[no preview available]',
          },
        ],
      },
      response_url:
        'https://hooks.slack.com/actions/T018UAQ7YRW/1809365465603/KPvO6Eijd4RDgscXV2Ro7avH',
      actions: [
        {
          action_id: 'view-undeployed-commits-',
          block_id: 'TvwVk',
          text: {
            type: 'plain_text',
            text: 'View Undeployed Commits',
            emoji: true,
          },
          value: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
          type: 'button',
          action_ts: '1614650317.491035',
        },
      ],
    });
    expect(actions.actionViewUndeployedCommits).toHaveBeenCalled();
    expect(bolt.client.views.open).toHaveBeenCalled();
    expect(await getLastSuccessfulDeploy()).toMatchObject({
      sha: '999999',
    });

    // Get list of commits
    expect(octokit.repos.compareCommits).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      base: '999999',
      head: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
    });

    expect(bolt.client.views.update.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "hash": "viewHash",
        "view": Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "Here are the list of commits that are currently undeployed",
                "type": "plain_text",
              },
              "type": "header",
            },
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*feat(ui): Change default period for fresh releases (#23572)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "The fresh releases (not older than one day) will have default statsPeriod on the release detail page set to 24 hours.",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "mars",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|mars (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "type": "divider",
            },
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*feat(ui): Change default period for fresh releases (#23572)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "The fresh releases (not older than one day) will have default statsPeriod on the release detail page set to 24 hours.",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "mars",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|mars (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "type": "divider",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "freight-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "https://freight.getsentry.net/deploy?app=getsentry",
                  "value": "455e3db9eb4fa6a1789b70e4045b194f02db0b59",
                },
              ],
              "type": "actions",
            },
          ],
          "callback_id": "view-undeployed-commits-modal",
          "title": Object {
            "text": "2 Undeployed commits",
            "type": "plain_text",
          },
          "type": "modal",
        },
        "view_id": "viewId",
      }
    `);
  });
});
