import merge from 'lodash.merge';

import payload from '@test/payloads/freight.json';
import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import { GETSENTRY_BOT_ID, REQUIRED_CHECK_NAME } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { Fastify } from '@/types';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import * as metrics from '@utils/metrics';

import { pleaseDeployNotifier } from '../pleaseDeployNotifier';

// Was having issues integration testing this (e.g. via fastify) due to async issues,
// instead test `handler` directly
import { handler, updateDeployNotifications } from '.';

describe('updateDeployNotifications', function () {
  let fastify: Fastify;
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
    jest.spyOn(metrics, 'insert');
    jest.spyOn(metrics, 'mapDeployToPullRequest');
    // @ts-ignore
    metrics.insert.mockImplementation(() => Promise.resolve());
    // @ts-ignore
    metrics.mapDeployToPullRequest.mockImplementation(() => Promise.resolve());
  });

  afterAll(async function () {
    await db.destroy();
    // @ts-ignore
    metrics.insert.mockReset();
    // @ts-ignore
    metrics.mapDeployToPullRequest.mockReset();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await updateDeployNotifications();
    await pleaseDeployNotifier();

    octokit = await getClient('getsentry');
    // @ts-ignore
    octokit.repos.compareCommits.mockImplementation(() => ({
      status: 200,
      data: {
        commits: [
          {
            sha: '982345',
            committer: {
              id: GETSENTRY_BOT_ID,
              email: 'bot@getsentry.com',
            },
            commit: {
              message:
                'getsentry/sentry@2188f0485424da597dcca9e12093d253ddc67c0a',
            },
          },
          {
            sha: '99999999',
            committer: {
              id: '123',
              email: 'mars@sentry.io',
            },
            commit: {
              message: 'feat: lands on mars',
            },
          },
        ],
      },
    }));

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

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    (bolt.client.chat.update as jest.Mock).mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
  });

  it('notifies slack user when check run is successful', async function () {
    const updateMock = bolt.client.chat.update as jest.Mock;

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '982345',
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: '982345',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        target: 'U789123',
        status: 'undeployed',
      },
    });

    await handler({ ...payload, status: 'queued', date_finished: null });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "attachments": Array [
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
                "text": Object {
                  "text": "You have queued this commit for deployment (</deploys/getsentry/production/13/|#13>)",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
            ],
            "color": "#E7E1EC",
          },
        ],
        "channel": "channel_id",
        "text": "Your commit getsentry@<https://github.com/getsentry/getsentry/commits/982345|982345> is queued for deployment",
        "ts": "1234123.123",
      }
    `);

    updateMock.mockClear();
    await handler({ ...payload, status: 'started', date_finished: null });
    expect(updateMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "attachments": Array [
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
                "text": Object {
                  "text": "You are deploying this commit (</deploys/getsentry/production/13/|#13>)",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
            ],
            "color": "#B6ECDF",
          },
        ],
        "channel": "channel_id",
        "text": "Your commit getsentry@<https://github.com/getsentry/getsentry/commits/982345|982345> is being deployed",
        "ts": "1234123.123",
      }
    `);

    updateMock.mockClear();
    // @ts-ignore
    bolt.client.chat.postMessage.mockClear();

    // Post message is called when finished
    await handler({ ...payload, status: 'finished' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[0][0])
      .toMatchInlineSnapshot(`
      Object {
        "attachments": Array [
          Object {
            "blocks": Array [
              Object {
                "elements": Array [
                  Object {
                    "action_id": "open-sentry-release-js",
                    "text": Object {
                      "emoji": true,
                      "text": "javascript",
                      "type": "plain_text",
                    },
                    "type": "button",
                    "url": "https://sentry.io/organizations/sentry/releases/c88d886ba52bd85431052abaef4916469f7db2e8/?project=11276",
                    "value": "js-release",
                  },
                  Object {
                    "action_id": "open-sentry-release-py",
                    "text": Object {
                      "emoji": true,
                      "text": "sentry",
                      "type": "plain_text",
                    },
                    "type": "button",
                    "url": "https://sentry.io/organizations/sentry/releases/c88d886ba52bd85431052abaef4916469f7db2e8/?project=1",
                    "value": "py-release",
                  },
                ],
                "type": "actions",
              },
            ],
            "color": "#33BF9E",
          },
        ],
        "channel": "channel_id",
        "text": "<@U789123>, your commit has been deployed. Please check the Sentry Releases linked below to make sure there are no issues.",
        "thread_ts": "1234123.123",
      }
    `);

    updateMock.mockClear();
    await handler({ ...payload, status: 'failed' });
    expect(updateMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "attachments": Array [
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
                    "value": "982345",
                  },
                  Object {
                    "action_id": "view-undeployed-commits-",
                    "text": Object {
                      "emoji": true,
                      "text": "View Undeployed Commits",
                      "type": "plain_text",
                    },
                    "type": "button",
                    "value": "982345",
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
            "color": "#F55459",
          },
        ],
        "channel": "channel_id",
        "text": "",
        "ts": "1234123.123",
      }
    `);
  });

  it('updates all slack messages when deploying a range of commits', async function () {
    const updateMock = bolt.client.chat.update as jest.Mock;

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '982345',
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

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '99999999',
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

    // Each commit will cause a message
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);
    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(2);
    expect(slackMessages[0]).toMatchObject({
      refId: '982345',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        target: 'U789123',
        status: 'undeployed',
      },
    });

    expect(slackMessages[1]).toMatchObject({
      refId: '99999999',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        target: 'U789123',
        status: 'undeployed',
      },
    });

    // Simulate freight deploy starting
    await handler({ ...payload, status: 'queued', date_finished: null });

    // Each commit (2) gets updated with new status
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('only attempts to update pleaseDeployNotifier messages', async function () {
    const updateMock = bolt.client.chat.update as jest.Mock;

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '982345',
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    await db('slack_messages').insert({
      refId: '982345',
      channel: 'channel_id',
      ts: '1234123.123',
      type: SlackMessage.REQUIRED_CHECK,
      context: {},
    });

    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(2);

    await handler({ ...payload, status: 'queued', date_finished: null });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
