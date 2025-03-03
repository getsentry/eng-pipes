import merge from 'lodash.merge';

import { createSlackRequest } from '@test/utils/createSlackRequest';
import { createGitHubEvent } from '@test/utils/github';
import { MockedGitHubAPI } from '@test/utils/testTypes';

import {
  DB_TABLE_MATERIALS,
  DB_TABLE_STAGES,
} from '@/brain/gocd/saveGoCDStageEvents';
import { buildServer } from '@/buildServer';
import {
  GETSENTRY_ORG,
  GOCD_ORIGIN,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
  REQUIRED_CHECK_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { queueCommitsForDeploy } from '@/utils/db/queueCommitsForDeploy';
import { bolt as originalBolt } from '@api/slack';
import { db } from '@utils/db';
import { getLastGetSentryGoCDDeploy } from '@utils/db/getLatestDeploy';

import { MockedBolt } from '../../../../test/utils/testTypes';
import { FINAL_STAGE_NAMES } from '../../../utils/gocd/gocdHelpers';

import * as actions from './actionViewUndeployedCommits';
import { pleaseDeployNotifier } from '.';

describe('pleaseDeployNotifier', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG as unknown as { api: MockedGitHubAPI };
  const bolt = originalBolt as unknown as MockedBolt;

  beforeAll(async function () {
    await db.migrate.latest();
    jest.spyOn(actions, 'actionViewUndeployedCommits');

    pleaseDeployNotifier();
    org.api.repos.getCommit.mockImplementation(({ repo }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
            sha: '88c22a29176df64cfc027637a5ccfd9da1544e9f',
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
    org.api.paginate.mockClear();
    org.api.repos.getCommit.mockClear();
    org.api.repos.compareCommits.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
    await db('queued_commits').delete();
    await db('gocd-stage-materials').delete();
    await db('gocd-stages').delete();
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
    expect(org.api.repos.getCommit).toHaveBeenCalledTimes(2);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('has a button to view undeployed commits in a modal if there is a successful deploy in db', async function () {
    // The actionViewUndeployedCommits requires a previous deploy
    // to get the list of commits that are undeployed.
    await db('gocd-stages').insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
      pipeline_counter: 2,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
      pipeline_build_cause: JSON.stringify([
        {
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:getsentry/getsentry.git',
            },
            type: 'git',
          },
          changed: false,
          modifications: [
            {
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),

      stage_name: FINAL_STAGE_NAMES[0],
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });
    await db('gocd-stage-materials').insert({
      stage_material_id: `123_github.com/example/example`,
      pipeline_id: 'pipeline-id-123',
      url: 'github.com/example/example',
      branch: 'master',
      revision: '333333',
    });

    expect(
      await getLastGetSentryGoCDDeploy(
        GOCD_SENTRYIO_BE_PIPELINE_GROUP,
        GOCD_SENTRYIO_BE_PIPELINE_NAME
      )
    ).toMatchObject({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
      pipeline_counter: 2,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
      pipeline_build_cause: [
        {
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:getsentry/getsentry.git',
            },
            type: 'git',
          },
          changed: false,
          modifications: [
            {
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ],

      stage_name: FINAL_STAGE_NAMES[0],
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: {},
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    // Mock user clicking "view undeployed commits"
    org.api.repos.getCommit.mockClear();
    await createSlackRequest(fastify, 'block_actions', {
      type: 'block_actions',
      user: {
        id: 'U018H4DA8N5',
        username: 'billy',
        name: 'billy',
        team_id: 'T018UAQ7YRW',
      },
      api_app_id: 'A017XPC80S2',
      token: 'sentrydevtoken',
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
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/455e3db9eb4fa6a1789b70e4045b194f02db0b59|455e3db> is ready to deploy',
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
                  text: '<https://github.com/getsentry/getsentry/commit/455e3db9eb4fa6a1789b70e4045b194f02db0b59|*fix(workflow): Fix inbox experiment test orgs (#5179)*>',
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
                    text: '<https://github.com/scttcper|Scott Cooper (scttcper)>',
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
                    action_id: 'gocd-deploy',
                    text: {
                      type: 'plain_text',
                      text: 'Deploy',
                      emoji: true,
                    },
                    style: 'primary',
                    value: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
                    url: GOCD_ORIGIN,
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
                        text: 'Are you sure you want to mute these deploy notifications? You can re-enable them by DM-ing me\n\n```\ndeploy notifications on\n```\n\nOr you can visit the App\'s "Home" tab in Slack.\n',
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

    // Wait for mock user click of "view undeployed commits" to finish.
    let wait = true;
    while (wait) {
      if (bolt.client.views.update.mock.calls.length > 0) {
        wait = false;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Ensure actionViewUndeployedCommits is querying the expected commit range.
    expect(org.api.repos.compareCommits).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      base: '333333',
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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

  it('links user to frontend-only deploy from a sentry commit', async function () {
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
    expect(org.api.repos.getCommit).toHaveBeenCalledTimes(2);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('links user to backend-only deploy from a sentry commit', async function () {
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
    expect(org.api.repos.getCommit).toHaveBeenCalledTimes(2);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('links user to frontend-only deploy from a getsentry commit', async function () {
    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
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
            message: `build(ci): Remove if: always() conditions from workflows (#29414)

Remove "always()" from GHA workflows`,
          },
        }),
      };
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

    // Only once because this is a commit on getsentry
    expect(org.api.repos.getCommit).toHaveBeenCalledTimes(1);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*build(ci): Remove if: always() conditions from workflows (#29414)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "Remove \\"always()\\" from GHA workflows",
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('links user to backend-only deploy from a getsentry commit', async function () {
    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
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
            message: `build(ci): Remove if: always() conditions from workflows (#29414)

Remove "always()" from GHA workflows`,
          },
        }),
      };
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

    // Only once because this is a commit on getsentry
    expect(org.api.repos.getCommit).toHaveBeenCalledTimes(1);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*build(ci): Remove if: always() conditions from workflows (#29414)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "Remove \\"always()\\" from GHA workflows",
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
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('does not allow frontend deploy if head commit is a backend change', async function () {
    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
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
            message: `build(ci): Remove if: always() conditions from workflows (#29414)

Remove "always()" from GHA workflows`,
          },
        }),
      };
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

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ready to deploy',
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
                  "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*build(ci): Remove if: always() conditions from workflows (#29414)*>",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
              Object {
                "text": Object {
                  "text": "Remove \\"always()\\" from GHA workflows",
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
                    "action_id": "gocd-deploy",
                    "style": "primary",
                    "text": Object {
                      "emoji": true,
                      "text": "Deploy",
                      "type": "plain_text",
                    },
                    "type": "button",
                    "url": "${GOCD_ORIGIN}",
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
            "color": "#E7E1EC",
          },
        ]
      `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('tells user GoCD frontend deploy is in progress', async function () {
    await queueCommitsForDeploy([
      {
        sha: '333333',
      },
    ]);
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'example-pipeline-id',
      pipeline_name: GOCD_SENTRYIO_FE_PIPELINE_NAME,
      pipeline_counter: 2,
      pipeline_group: 'sentryio',
      pipeline_build_cause: '{}',
      stage_name: 'example-stage',
      stage_counter: 3,
      stage_approval_type: '',
      stage_approved_by: 'example.user@sentry.op',
      stage_state: 'Building',
      stage_result: '',
      stage_create_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_last_transition_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_jobs: '{}',
    });
    await db(DB_TABLE_MATERIALS).insert({
      stage_material_id: `example-pipeline-id_github.com/getsentry/getsentry_333333`,
      pipeline_id: 'example-pipeline-id',
      url: 'github.com/getsentry/getsentry',
      branch: 'master',
      revision: '333333',
    });

    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      return {
        data: merge({}, defaultPayload),
      };
    });

    org.api.paginate.mockImplementation((_, { ref, _repo }) => {
      if (ref === '6d225cb77225ac655d817a7551a26fff85090fe6') {
        return [
          {
            name: 'only frontend changes',
            conclusion: 'success',
          },
        ];
      }
      throw new Error(`Unknown commit ref: ${ref}`);
    });

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '333333',
        output: {
          title: '',
          summary: '',
          text: '',
          annotations_count: 0,
          annotations_url: '',
        },
      },
    });

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U789123',
        text: 'Your commit getsentry@<https://github.com/getsentry/getsentry/commits/333333|333333> is being deployed',
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
                  "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*getsentry/sentry@88c22a29176df64cfc027637a5ccfd9da1544e9f*>",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
              Object {
                "text": Object {
                  "text": "#skipsentry",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
              Object {
                "elements": Array [
                  Object {
                    "alt_text": "Matej Minar",
                    "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                    "type": "image",
                  },
                  Object {
                    "text": "<https://github.com/matejminar|Matej Minar (matejminar)>",
                    "type": "mrkdwn",
                  },
                ],
                "type": "context",
              },
              Object {
                "text": Object {
                  "text": "<@U789123> has begun deploying this commit (<${GOCD_ORIGIN}/go/pipelines/${GOCD_SENTRYIO_FE_PIPELINE_NAME}/2/example-stage/3|${GOCD_SENTRYIO_FE_PIPELINE_NAME}: Stage 3>)",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
            ],
            "color": "#E7E1EC",
          },
        ]
      `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '333333',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('asks user to deploy backend while frontend deploy is in progress', async function () {
    await queueCommitsForDeploy([
      {
        sha: '333333',
      },
    ]);
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'example-pipeline-id',
      pipeline_name: GOCD_SENTRYIO_FE_PIPELINE_NAME,
      pipeline_counter: 2,
      pipeline_group: 'sentryio',
      pipeline_build_cause: '{}',
      stage_name: 'example-stage',
      stage_counter: 3,
      stage_approval_type: '',
      stage_approved_by: 'example.user@sentry.op',
      stage_state: 'Building',
      stage_result: '',
      stage_create_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_last_transition_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_jobs: '{}',
    });
    await db(DB_TABLE_MATERIALS).insert({
      stage_material_id: `example-pipeline-id_github.com/getsentry/getsentry_333333`,
      pipeline_id: 'example-pipeline-id',
      url: 'github.com/getsentry/getsentry',
      branch: 'master',
      revision: '333333',
    });

    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      return {
        data: merge({}, defaultPayload),
      };
    });

    org.api.paginate.mockImplementation((_, { ref, _repo }) => {
      if (ref === '6d225cb77225ac655d817a7551a26fff85090fe6') {
        return [
          {
            name: 'only backend changes',
            conclusion: 'success',
          },
        ];
      }
      throw new Error(`Unknown commit ref: ${ref}`);
    });

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '333333',
        output: {
          title: '',
          summary: '',
          text: '',
          annotations_count: 0,
          annotations_url: '',
        },
      },
    });

    // First message
    expect(bolt.client.chat.postMessage.mock.calls[0][0].attachments)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*getsentry/sentry@88c22a29176df64cfc027637a5ccfd9da1544e9f*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "#skipsentry",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "Matej Minar",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|Matej Minar (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
                  "value": "333333",
                },
                Object {
                  "action_id": "view-undeployed-commits-",
                  "text": Object {
                    "emoji": true,
                    "text": "View Undeployed Commits",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "333333",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '333333',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });

  it('asks user to deploy fullstack change', async function () {
    await queueCommitsForDeploy([
      {
        sha: '333333',
      },
    ]);
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'example-pipeline-id',
      pipeline_name: GOCD_SENTRYIO_FE_PIPELINE_NAME,
      pipeline_counter: 2,
      pipeline_group: 'sentryio',
      pipeline_build_cause: '{}',
      stage_name: 'example-stage',
      stage_counter: 3,
      stage_approval_type: '',
      stage_approved_by: 'example.user@sentry.op',
      stage_state: 'Building',
      stage_result: '',
      stage_create_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_last_transition_time: 'Nov 4, 2022, 1:33:26 PM',
      stage_jobs: '{}',
    });
    await db(DB_TABLE_MATERIALS).insert({
      stage_material_id: `example-pipeline-id_github.com/getsentry/getsentry_333333`,
      pipeline_id: 'example-pipeline-id',
      url: 'github.com/getsentry/getsentry',
      branch: 'master',
      revision: '333333',
    });

    org.api.repos.getCommit.mockImplementation(({ _repo, _ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      return {
        data: merge({}, defaultPayload),
      };
    });

    org.api.checks.listForRef.mockImplementation(({ ref, _repo }) => {
      if (ref === '6d225cb77225ac655d817a7551a26fff85090fe6') {
        return [
          {
            name: 'fullstack change',
            conclusion: 'success',
          },
        ];
      }
      throw new Error(`Unknown commit ref: ${ref}`);
    });

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '333333',
        output: {
          title: '',
          summary: '',
          text: '',
          annotations_count: 0,
          annotations_url: '',
        },
      },
    });

    // First message
    expect(bolt.client.chat.postMessage.mock.calls[0][0].attachments)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*getsentry/sentry@88c22a29176df64cfc027637a5ccfd9da1544e9f*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "#skipsentry",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "Matej Minar",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|Matej Minar (matejminar)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "gocd-deploy",
                  "style": "primary",
                  "text": Object {
                    "emoji": true,
                    "text": "Deploy",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "url": "${GOCD_ORIGIN}",
                  "value": "333333",
                },
                Object {
                  "action_id": "view-undeployed-commits-",
                  "text": Object {
                    "emoji": true,
                    "text": "View Undeployed Commits",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "333333",
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
          "color": "#E7E1EC",
        },
      ]
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '333333',
      channel: 'U789123',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });
});
