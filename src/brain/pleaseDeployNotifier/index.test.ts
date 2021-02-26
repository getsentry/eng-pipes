jest.mock('@utils/loadBrain');
jest.mock('@api/github/getClient');

import merge from 'lodash.merge';

import { createGitHubEvent } from '@test/utils/createGitHubEvent';

import { buildServer } from '@/buildServer';
import { REQUIRED_CHECK_CHANNEL, REQUIRED_CHECK_NAME } from '@/config';
import { Fastify } from '@/types';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { pleaseDeployNotifier } from '.';

describe('pleaseDeployNotifier', function () {
  let fastify: Fastify;
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await pleaseDeployNotifier();
    octokit = await getClient('getsentry', 'getsentry');
  });

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
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
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        status: 'undeployed',
      },
    });
  });
});
