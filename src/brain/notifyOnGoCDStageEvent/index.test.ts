import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';
import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import {
  GETSENTRY_BOT_ID,
  GOCD_ORIGIN,
  REQUIRED_CHECK_NAME,
  SENTRYIO_GOCD_PIPELINE_GROUP,
} from '@/config';
import { Fastify } from '@/types';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import * as metrics from '@utils/metrics';

import { pleaseDeployNotifier } from '../pleaseDeployNotifier';

import { handler, notifyOnGoCDStageEvent } from '.';

describe('notifyOnGoCDStageEvent', function () {
  let fastify: Fastify;
  let octokit;
  let gocdPayload;

  beforeAll(async function () {
    await db.migrate.latest();
    jest.spyOn(metrics, 'insert');
    jest.spyOn(metrics, 'mapDeployToPullRequest');
    // @ts-ignore
    metrics.insert.mockImplementation(() => Promise.resolve());
    // @ts-ignore
    metrics.mapDeployToPullRequest.mockImplementation(() => Promise.resolve());

    gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          group: SENTRYIO_GOCD_PIPELINE_GROUP,
        },
      },
    });
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
    await pleaseDeployNotifier();
    await notifyOnGoCDStageEvent();

    octokit = await getClient(ClientType.App, 'getsentry');
    octokit.checks.listForRef.mockImplementation(() => ({
      data: {
        check_runs: [{ name: 'only backend changes', conclusion: 'success' }],
      },
    }));
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

      return { data: merge({}, defaultPayload, { sha: '982345' }) };
    });
  });

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    octokit.checks.listForRef.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    (bolt.client.chat.update as jest.Mock).mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();
    await db('queued_commits').delete();
  });

  it('do nothing for pipeline outside of expected group', async function () {
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            group: 'other',
          },
        },
      })
    );
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('do nothing for pipeline that doesnt have the getsentry repo in its build causes', async function () {
    const nobuild = merge({}, gocdPayload);
    delete nobuild.data.pipeline['build-cause'];
    await handler(
      merge({}, nobuild, {
        data: {
          pipeline: {
            'build-cause': [
              {},
              {
                material: {},
              },
              {
                material: {
                  'git-configuration': {
                    'shallow-clone': false,
                    branch: 'master',
                    url: 'git@github.com:getsentry/other.git',
                  },
                  type: 'git',
                },
                changed: false,
                modifications: [
                  {
                    revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
                    'modified-time': 'Oct 26, 2022, 5:05:17 PM',
                    data: {},
                  },
                ],
              },
            ],
          },
        },
      })
    );
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
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
          text: '',
          annotations_count: 0,
          annotations_url: '',
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

    await handler(gocdPayload);
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
                  "text": "You have queued this commit for deployment (<${GOCD_ORIGIN}/go/pipelines/getsentry_frontend/20/preliminary-checks/1|getsentry_frontend: Stage 1>)",
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
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: { counter: '2' },
          },
        },
      })
    );

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
                  "text": "You have begun deploying this commit (<${GOCD_ORIGIN}/go/pipelines/getsentry_frontend/20/preliminary-checks/2|getsentry_frontend: Stage 2>)",
                  "type": "mrkdwn",
                },
                "type": "section",
              },
            ],
            "color": "#E7E1EC",
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
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: { state: 'Passed', result: 'Passed' },
          },
        },
      })
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[0][0])
      .toMatchInlineSnapshot(`
      Object {
        "channel": "channel_id",
        "text": "Your commit has been deployed. *Note* This message from Sentaur is now deprecated as this feature is now native to Sentry. Please <https://sentry.io/settings/account/notifications/deploy/|configure your Sentry deploy notifications here> to turn on Slack deployment notifications",
        "thread_ts": "1234123.123",
      }
    `);

    updateMock.mockClear();
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: { state: 'Failed', result: 'Failed' },
          },
        },
      })
    );

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
                  "text": "You have failed to deploy this commit (<${GOCD_ORIGIN}/go/pipelines/getsentry_frontend/20/preliminary-checks/1|getsentry_frontend: Stage 1>)",
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
});