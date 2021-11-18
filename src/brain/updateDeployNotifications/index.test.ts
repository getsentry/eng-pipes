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

import { handler as deployStateHandler } from '../deployState';
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
    await db('deploys').delete();
    await db('queued_commits').delete();
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
        "channel": "channel_id",
        "text": "<@U789123>, your commit has been deployed. *Note* This message from Sentaur is now deprecated as this feature is now native to Sentry. Please <https://sentry.io/settings/account/notifications/deploy/|configure your Sentry deploy notifications here> to turn on Slack deployment notifications",
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
                "text": Object {
                  "text": "You have failed to deploy this commit (</deploys/getsentry/production/13/|#13>)

      > [freight/production] Freight started deploy </deploys/freight/production/18|#18> (f3d0c2e)
      ",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
            ],
            "color": "#F55459",
          },
        ],
        "channel": "channel_id",
        "text": "Your commit getsentry@<https://github.com/getsentry/getsentry/commits/982345|982345> failed to deploy",
        "ts": "1234123.123",
      }
    `);
  });

  /**
   * This happens because we have `getsentry` deploying frontend and backend
   * changes while `getsentry-frontend` only deploys frontend. Because of this
   * relationship, we need to calculate the queued commits for deploy based on
   * the latest deployed commit between the two Freight apps
   */
  it('only notifies slack user once when previous deploy of a Freight project is not the latest deploy on production', async function () {
    // Add existing deploy to frontend project, this commit should be "more recent" than the `previous_sha` from payload
    await db('deploys').insert({
      external_id: 1,
      user_id: 1,
      app_name: 'getsentry-frontend',
      user: 'test@sentry.io',
      ref: 'master',
      sha: '555555',
      previous_sha: '444444',
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

    // @ts-ignore
    bolt.client.chat.postMessage.mockClear();

    // Post message is called when finished
    await handler({
      ...payload,
      sha: '888888',
      previous_sha: '222222',
      status: 'finished',
    });

    expect(octokit.repos.compareCommits).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base: '555555',
        head: '888888',
      })
    );
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

  it('notifies user commit is already queued for deploy', async function () {
    const postMock = bolt.client.chat.postMessage as jest.Mock;
    const updateMock = bolt.client.chat.update as jest.Mock;
    const freightHandlers = [deployStateHandler, handler];
    const callFreightHandlers = async (payload) =>
      await Promise.all(freightHandlers.map((h) => h(payload)));

    // head: c88d886ba52bd85431052abaef4916469f7db2e8
    // base (previous deploy): ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f

    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
            commit: {
              author: {
                name: 'billy',
                email: 'billy@sentry.io',
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
    octokit.repos.compareCommits.mockClear();
    octokit.repos.compareCommits.mockImplementation(() => ({
      status: 200,
      data: {
        commits: [
          {
            sha: '99999999',
            committer: {
              id: '123',
              email: 'billy@sentry.io',
            },
            commit: {
              message: 'feat: lands on mars',
            },
          },
          {
            sha: '982345',
            committer: {
              id: '5783',
              email: 'foo@sentry.io',
            },
            commit: {
              message: 'feat: my deploy',
            },
          },
          {
            sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
            committer: {
              id: GETSENTRY_BOT_ID,
              email: 'bot@getsentry.com',
            },
            commit: {
              message:
                'getsentry/sentry@2188f0485424da597dcca9e12093d253ddc67c0a',
            },
          },
        ],
      },
    }));

    // Need to save deploy in db
    await callFreightHandlers({
      ...payload,
      status: 'queued',
      date_finished: null,
    });

    // We should have 3 commits queued up
    expect(await db('queued_commits').select('*')).toHaveLength(3);

    // This is to test that the correct commits are removed when deploy finishes
    await db('queued_commits').insert({
      head_sha: 'irrelevant',
      sha: 'irrelevant',
    });

    // Checks pass
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

    // No message to update
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(0);

    // Message to user that their commit is already queued
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toMatchInlineSnapshot(`
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
                    "alt_text": "billy",
                    "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                    "type": "image",
                  },
                  Object {
                    "text": "<https://github.com/matejminar|billy (matejminar)>",
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
        "channel": "U789123",
        "text": "Your commit getsentry@<https://github.com/getsentry/getsentry/commits/982345|982345> is ready to deploy",
      }
    `);

    updateMock.mockClear();
    await callFreightHandlers({
      ...payload,
      status: 'started',
      date_finished: null,
    });

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
                    "alt_text": "billy",
                    "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                    "type": "image",
                  },
                  Object {
                    "text": "<https://github.com/matejminar|billy (matejminar)>",
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
    await callFreightHandlers({ ...payload, status: 'finished' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[0][0])
      .toMatchInlineSnapshot(`
      Object {
        "channel": "channel_id",
        "text": "<@U789123>, your commit has been deployed. *Note* This message from Sentaur is now deprecated as this feature is now native to Sentry. Please <https://sentry.io/settings/account/notifications/deploy/|configure your Sentry deploy notifications here> to turn on Slack deployment notifications",
        "thread_ts": "1234123.123",
      }
    `);

    expect(await db('queued_commits').select('*')).toHaveLength(1);
  });
});
