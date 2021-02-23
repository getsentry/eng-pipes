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

import { requiredChecks } from '.';

describe('requiredChecks', function () {
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
    await requiredChecks();
    octokit = await getClient('getsentry', 'getsentry');
  });

  afterEach(async function () {
    fastify.close();
    octokit.repos.getCommit.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    await db('slack_messages').delete();
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
    expect(bolt.client.chat.postMessage).not.toHaveBeenCalled();
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
    expect(bolt.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('notifies slack channel with failure due to a sentry commit (via getsentry bump commit)', async function () {
    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
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

      return { data: defaultPayload };
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text:
          'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
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
          ],
          "color": "#F55459",
        },
      ]
    `);

    // Threaded message with job statuses
    expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: 'channel_id',
        thread_ts: '1234123.123',
      })
    );
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[1][0].text)
      .toMatchInlineSnapshot(`
      "Here are the job statuses

      <https://github.com/getsentry/getsentry/runs/1821956940|backend test (0)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821956965|backend test (1)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821952498|lint backend> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821957645|sentry cli test (0)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821955194|typescript and lint> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821960976|acceptance> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821960888|frontend tests> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821955073|sentry backend test> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821955151|webpack> -  ✅  success "
    `);

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        passed_at: null,
        status: 'failure',
      },
    });
  });

  it('does not double post if sha was already failing', async function () {
    octokit.repos.getCommit.mockImplementation(({ repo, ref }) => {
      const defaultPayload = require('@test/payloads/github/commit').default;
      if (repo === 'sentry') {
        return {
          data: merge({}, defaultPayload, {
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

      return { data: defaultPayload };
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);

    octokit.repos.getCommit.mockClear();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text:
          'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
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
          ],
          "color": "#F55459",
        },
      ]
    `);

    // Threaded message with job statuses
    expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: 'channel_id',
        thread_ts: '1234123.123',
      })
    );
    // @ts-ignore
    expect(bolt.client.chat.postMessage.mock.calls[1][0].text)
      .toMatchInlineSnapshot(`
      "Here are the job statuses

      <https://github.com/getsentry/getsentry/runs/1821956940|backend test (0)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821956965|backend test (1)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821952498|lint backend> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821957645|sentry cli test (0)> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821955194|typescript and lint> -  ❌  failure 
      <https://github.com/getsentry/getsentry/runs/1821960976|acceptance> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821960888|frontend tests> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821955073|sentry backend test> -  ❌  skipped 
      <https://github.com/getsentry/getsentry/runs/1821955151|webpack> -  ✅  success "
    `);
  });

  it('saves state of a failed check, and updates slack message when it is passing again', async function () {
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);

    // First message
    expect(bolt.client.chat.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: REQUIRED_CHECK_CHANNEL,
        text:
          'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is failing (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
      })
    );

    // Threaded message with job statuses
    expect(bolt.client.chat.postMessage).toHaveBeenLastCalledWith(
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
        passed_at: null,
        status: 'failure',
      },
    });

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

    expect(await db('slack_messages').first('*')).toMatchObject({
      refId: '6d225cb77225ac655d817a7551a26fff85090fe6',
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        status: 'success',
      },
    });

    expect(await bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(await bolt.client.chat.update).toHaveBeenCalledWith({
      attachments: expect.arrayContaining([
        {
          blocks: [
            {
              text: {
                text:
                  'getsentry@master <https://github.com/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6|6d225cb> is ~failing~ passing! (<https://github.com/Codertocat/Hello-World/runs/128620228|View Build>)',
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
  });
});
