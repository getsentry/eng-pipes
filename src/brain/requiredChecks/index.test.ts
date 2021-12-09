const mockInsert = jest.fn(() => Promise.resolve());
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

// Needs to be mocked before `@utils/metrics`
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function () {
    return {
      dataset: mockDataset,
    };
  },
}));

import merge from 'lodash.merge';

import { createGitHubEvent } from '@test/utils/github';

import { buildServer } from '@/buildServer';
import {
  BuildStatus,
  REQUIRED_CHECK_CHANNEL,
  REQUIRED_CHECK_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { db } from '@/utils/db';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import * as getFailureMessages from '@utils/db/getFailureMessages';
import { getTimestamp } from '@utils/db/getTimestamp';
import * as saveSlackMessage from '@utils/db/saveSlackMessage';
import { TARGETS } from '@utils/metrics';

import { restartFlakeyJobs } from './restartFlakeyJobs';
import { requiredChecks } from '.';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

jest.mock('./restartFlakeyJobs', () => ({
  restartFlakeyJobs: jest.fn(async () => ({ isRestarting: false })),
}));

describe('requiredChecks', function () {
  let fastify: Fastify;
  let octokit;
  const postMessage = bolt.client.chat.postMessage as jest.Mock;
  const updateMessage = bolt.client.chat.update as jest.Mock;
  const SCHEMA = Object.entries(TARGETS.brokenBuilds.schema).map(
    ([name, type]) => ({
      name,
      type,
    })
  );

  beforeAll(async function () {
    await db.migrate.latest();
    jest.spyOn(getFailureMessages, 'getFailureMessages');
    jest.spyOn(saveSlackMessage, 'saveSlackMessage');
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await requiredChecks();
    octokit = await getClient('getsentry');

    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
            sha: ref,
            commit: {
              author: {
                name: 'Matej Minar',
                email: 'matej.minar@sentry.io',
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

      return { data: merge({}, defaultPayload, { sha: ref }) };
    });
  });

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    postMessage.mockClear();
    updateMessage.mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
    await db('slack_messages').delete();
    await db('users').delete();
    (getFailureMessages.getFailureMessages as jest.Mock).mockClear();
    (saveSlackMessage.saveSlackMessage as jest.Mock).mockClear();
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
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('ignores successful conclusions', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
      },
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('ignores other check runs', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: 'other check run',
      },
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('notifies slack channel with failure due to a sentry commit (via getsentry bump commit)', async function () {
    await db('users').insert({
      email: 'matej.minar@sentry.io',
      slackUser: 'U123123',
      githubUser: 'matejminar',
    });
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(2);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text: 'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
      })
    );

    // @ts-ignore
    expect(postMessage.mock.calls[0][0].attachments).toMatchInlineSnapshot(`
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
                  "alt_text": "Matej Minar",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<@U123123>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "revert-commit",
                  "style": "danger",
                  "text": Object {
                    "emoji": true,
                    "text": "Revert Commit",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "{\\"sha\\":\\"88c22a29176df64cfc027637a5ccfd9da1544e9f\\",\\"repo\\":\\"sentry\\"}",
                },
              ],
              "type": "actions",
            },
          ],
          "color": "#F55459",
        },
      ]
    `);

    // Threaded message with job statuses
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: 'channel_id',
        thread_ts: '1234123.123',
      })
    );
    // @ts-ignore
    expect(postMessage.mock.calls[1][0].text).toMatchInlineSnapshot(
      `"Here are the job statuses"`
    );

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        status: 'failure',
      },
    });
  });

  it('does not double post if sha was already failing', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(2);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(2);

    octokit.repos.getCommit.mockClear();
    (postMessage as jest.Mock).mockClear();
    // Signal the same check run as above, should not post again to slack
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(0);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(0);
  });

  it('notifies slack channel with failure due to a getsentry commit (not a getsentry bump commit)', async function () {
    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      return {
        data: merge({}, defaultPayload, {
          author: {
            login: 'maheskett',
          },
          commit: {
            author: {
              name: 'Megan Heskett',
              email: 'megan@sentry.io',
            },
            committer: {
              name: 'GitHub',
              email: 'noreply@github.com',
              date: '2021-02-03T11:06:46Z',
            },
            message:
              'feat(ui): Display gifted attachments (#5043)\n' +
              '\n' +
              '<img width="706" alt="Screen Shot 2021-02-02 at 1 22 41 AM" src="https://user-images.githubusercontent.com/16394317/106579121-2a0a1100-64f5-11eb-9bdc-48877d5f7173.png">',
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
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });

    // Only called once because we don't need to look for sentry commit
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(1);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text: 'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
      })
    );
    // @ts-ignore
    expect(postMessage.mock.calls[0][0].attachments).toMatchInlineSnapshot(`
      Array [
        Object {
          "blocks": Array [
            Object {
              "text": Object {
                "text": "<https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6|*feat(ui): Display gifted attachments (#5043)*>",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "text": Object {
                "text": "<img width=\\"706\\" alt=\\"Screen Shot 2021-02-02 at 1 22 41 AM\\" src=\\"https://user-images.githubusercontent.com/16394317/106579121-2a0a1100-64f5-11eb-9bdc-48877d5f7173.png\\">",
                "type": "mrkdwn",
              },
              "type": "section",
            },
            Object {
              "elements": Array [
                Object {
                  "alt_text": "Megan Heskett",
                  "image_url": "https://avatars.githubusercontent.com/u/9060071?v=4",
                  "type": "image",
                },
                Object {
                  "text": "<https://github.com/matejminar|Megan Heskett (maheskett)>",
                  "type": "mrkdwn",
                },
              ],
              "type": "context",
            },
            Object {
              "elements": Array [
                Object {
                  "action_id": "revert-commit",
                  "style": "danger",
                  "text": Object {
                    "emoji": true,
                    "text": "Revert Commit",
                    "type": "plain_text",
                  },
                  "type": "button",
                  "value": "{\\"sha\\":\\"6d225cb77225ac655d817a7551a26fff85090fe6\\",\\"repo\\":\\"getsentry\\"}",
                },
              ],
              "type": "actions",
            },
          ],
          "color": "#F55459",
        },
      ]
    `);

    // Threaded message with job statuses
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: 'channel_id',
        thread_ts: '1234123.123',
      })
    );
    // @ts-ignore
    expect(postMessage.mock.calls[1][0].blocks).toMatchInlineSnapshot(`
      Array [
        Object {
          "text": Object {
            "emoji": true,
            "text": "Job Statuses",
            "type": "plain_text",
          },
          "type": "header",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821956940|backend test (0)> -  ❌  failure ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "text": Object {
            "text": "\`\`\`
          <https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py|tests/snuba/rules/conditions/test_event_frequency.py#L570>
          EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError
          \`\`\`",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821956965|backend test (1)> -  ❌  failure ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "text": Object {
            "text": "\`\`\`
          <https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py|tests/snuba/rules/conditions/test_event_frequency.py#L570>
          EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError
          \`\`\`",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821952498|lint backend> -  ❌  failure ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "text": Object {
            "text": "\`\`\`
          <https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py|tests/snuba/rules/conditions/test_event_frequency.py#L570>
          EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError
          \`\`\`",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821957645|sentry cli test (0)> -  ❌  failure ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "text": Object {
            "text": "\`\`\`
          <https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py|tests/snuba/rules/conditions/test_event_frequency.py#L570>
          EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError
          \`\`\`",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821955194|typescript and lint> -  ❌  failure ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "text": Object {
            "text": "\`\`\`
          <https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py|tests/snuba/rules/conditions/test_event_frequency.py#L570>
          EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError
          \`\`\`",
            "type": "mrkdwn",
          },
          "type": "section",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821960976|acceptance> -  ❌  skipped ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821960888|frontend tests> -  ❌  skipped ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821955073|sentry backend test> -  ❌  skipped ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
        Object {
          "elements": Array [
            Object {
              "text": "<https://github.com/getsentry/getsentry/runs/1821955151|webpack> -  ✅  success ",
              "type": "mrkdwn",
            },
          ],
          "type": "context",
        },
      ]
    `);
  });

  it('saves state of a failed check, and updates slack message when it is passing again (ignoring any following failed tests)', async function () {
    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      return {
        data: merge({}, defaultPayload, {
          author: {
            login: 'maheskett',
          },
          commit: {
            author: {
              name: 'Megan Heskett',
              email: 'megan@sentry.io',
            },
            committer: {
              name: 'GitHub',
              email: 'noreply@github.com',
              date: '2021-02-03T11:06:46Z',
            },
            message:
              'feat(ui): Display gifted attachments (#5043)\n' +
              '\n' +
              '<img width="706" alt="Screen Shot 2021-02-02 at 1 22 41 AM" src="https://user-images.githubusercontent.com/16394317/106579121-2a0a1100-64f5-11eb-9bdc-48877d5f7173.png">',
          },
        }),
      };
    });

    expect(await db('slack_messages').first('*')).toBeUndefined();

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        completed_at: '2018-10-18T20:11:20.823Z',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });

    // Only called once because we don't need to look for sentry commit
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(1);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text: 'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
      })
    );

    // Threaded message with job statuses
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: 'channel_id',
        thread_ts: '1234123.123',
      })
    );

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        status: 'failure',
      },
    });

    postMessage.mockClear();
    (getFailureMessages.getFailureMessages as jest.Mock).mockClear();

    // Now create a successful run
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        completed_at: '2018-10-18T23:14:30.707Z',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ✅ success |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ✅ success |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ✅ success |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ✅ success |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ✅ success |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ✅ skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ✅ skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ✅ skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });

    expect(updateMessage).toHaveBeenCalledTimes(1);
    expect(updateMessage).toHaveBeenCalledWith({
      attachments: expect.arrayContaining([
        {
          blocks: [
            {
              text: {
                text: 'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ~failing~ passing! (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
                type: 'mrkdwn',
              },
              type: 'section',
            },
          ],
          color: '#33BF9E',
        },
      ]),
      channel: 'channel_id',
      ts: '1234123.123',
    });

    expect(postMessage).toHaveBeenCalledTimes(0);
    // Update previous failed messsages
    expect(updateMessage).toHaveBeenCalledTimes(1);

    // All three checks should be in database, with ref 111 as passing
    const results = await db('slack_messages')
      .select('refId')
      .select(db.raw(`context::json->>'status' as status`))
      .orderByRaw(`${getTimestamp(`context::json->>'failed_at'`)} desc`);

    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "refId": "6d225cb77225ac655d817a7551a26fff85090fe6",
          "status": "flake",
        },
      ]
    `);

    // This also gets inserted into big query
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('broken_builds');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        build_id: '6d225cb77225ac655d817a7551a26fff85090fe6',
        repo: 'getsentry/getsentry',
        start_timestamp: new Date('2018-10-18T20:11:20.823Z'),
        end_timestamp: new Date('2018-10-18T23:14:30.707Z'),
      },
      { schema: SCHEMA }
    );
  });

  it('does not post if most jobs are still missing and there are no failures', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  missing |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  missing |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  missing |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  missing |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  missing |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  missing |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  missing |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  missing |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(0);
  });

  it('post if most jobs are missing, but there is a single failure', async function () {
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  missing |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  missing |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  missing |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  missing |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  missing |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  missing |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  missing |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('does not continue to notify after the first test failure', async function () {
    let results;

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '111',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    postMessage.mockClear();

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '222',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n',
        },
      },
    });

    // Failure gets posted to the previous message as a threaded message
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].text).toMatch('222');
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      // thread_ts being defined means it is a threaded message
      thread_ts: '1234123.123',
    });

    // Both checks should be in database
    results = await db('slack_messages').select('*');
    expect(results).toHaveLength(2);

    postMessage.mockClear();

    // Create a new passing check run (eg sha is different from all previous failed events)
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '333',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n',
        },
      },
    });

    // Failure gets posted to the previous message as a threaded message
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].text).toMatch('333');
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      // thread_ts being defined means it is a threaded message
      thread_ts: '1234123.123',
    });

    // All three checks should be in database
    results = await db('slack_messages').select('*');
    expect(results).toHaveLength(3);

    postMessage.mockClear();
    (saveSlackMessage.saveSlackMessage as jest.Mock).mockClear();

    // Now we create a new check run that is passing, that should cause the first failing check run to pass
    // and the others to be unknown
    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'success',
        name: REQUIRED_CHECK_NAME,
        head_sha: '444',
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
        },
      },
    });

    // Post new success message in thread
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_ts: '1234123.123',
      })
    );
    // Update previous failed messsages
    expect(updateMessage).toHaveBeenCalledTimes(3);

    // This is now required because of `updateRequiredCheck()` and its async db query
    // Alternatively, we'd have to do a more complex mock of the db query
    await tick();

    expect(saveSlackMessage.saveSlackMessage).toHaveBeenCalledTimes(3);
    expect(saveSlackMessage.saveSlackMessage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: BuildStatus.UNKNOWN })
    );
    expect(saveSlackMessage.saveSlackMessage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: BuildStatus.UNKNOWN })
    );
    expect(saveSlackMessage.saveSlackMessage).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: BuildStatus.FIXED })
    );
  });

  it('does not notify slack channel when restarting due to intermittent CI issue', async function () {
    // @ts-expect-error
    restartFlakeyJobs.mockImplementation(async () => ({ isRestarting: true }));

    await db('users').insert({
      email: 'matej.minar@sentry.io',
      slackUser: 'U123123',
      githubUser: 'matejminar',
    });

    await createGitHubEvent(fastify, 'check_run', {
      repository: {
        full_name: 'getsentry/getsentry',
      },
      check_run: {
        status: 'completed',
        conclusion: 'failure',
        name: REQUIRED_CHECK_NAME,
        head_sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
        output: {
          title: '5 checks failed',
          summary: '5 checks failed',
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
            '| [backend test (0)](https://github.com/getsentry/getsentry/runs/1821956940) | ❌  failure |\n' +
            '| [backend test (1)](https://github.com/getsentry/getsentry/runs/1821956965) | ❌  failure |\n' +
            '| [lint backend](https://github.com/getsentry/getsentry/runs/1821952498) | ❌  failure |\n' +
            '| [sentry cli test (0)](https://github.com/getsentry/getsentry/runs/1821957645) | ❌  failure |\n' +
            '| [typescript and lint](https://github.com/getsentry/getsentry/runs/1821955194) | ❌  failure |\n' +
            '| [acceptance](https://github.com/getsentry/getsentry/runs/1821960976) | ❌  skipped |\n' +
            '| [frontend tests](https://github.com/getsentry/getsentry/runs/1821960888) | ❌  skipped |\n' +
            '| [sentry backend test](https://github.com/getsentry/getsentry/runs/1821955073) | ❌  skipped |\n' +
            '| [webpack](https://github.com/getsentry/getsentry/runs/1821955151) | ✅  success |\n',
          annotations_count: 0,
          annotations_url:
            'https://api.github.com/repos/getsentry/getsentry/check-runs/1821995033/annotations',
        },
      },
    });
    expect(octokit.repos.getCommit).toHaveBeenCalledTimes(2);

    // This is called twice because we use threads to list the job statuses
    expect(postMessage).toHaveBeenCalledTimes(0);

    expect(await db('slack_messages').first('*')).toBeUndefined();
  });
});
