import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { ghaCancel } from '.';

describe('gha-test', function () {
  let fastify;
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
  });
  afterAll(async function () {
    await db.destroy();
  });
  beforeEach(async function () {
    await db('users').delete();
    octokit = await getClient(ClientType.App, 'Enterprise');
    fastify = await buildServer(false);
    ghaCancel();
    // @ts-ignore
    bolt.client.chat.postMessage.mockClear();
    // @ts-ignore
    bolt.client.chat.update.mockClear();
    octokit.pulls.get.mockClear();
    octokit.actions.listWorkflowRunsForRepo.mockClear();

    octokit.pulls.get.mockImplementation(() => ({
      data: {
        head: {
          ref: 'head_ref',
        },
      },
    }));
    octokit.actions.listWorkflowRunsForRepo.mockImplementation(() => ({
      data: {
        workflow_runs: [
          {
            id: 1,
            status: 'completed',
            name: 'completed job',
          },
          {
            id: 2,
            status: 'in_progress',
            name: 'job 1',
          },
          {
            id: 3,
            status: 'in_progress',
            name: 'job 2',
          },
        ],
      },
    }));
  });

  afterEach(async function () {
    fastify.close();
    // @ts-ignore
    bolt.client.chat.postMessage.mockClear();
    // @ts-ignore
    bolt.client.chat.update.mockClear();
    octokit.pulls.get.mockClear();
    octokit.actions.listWorkflowRunsForRepo.mockClear();
    await db('users').delete();
  });

  it('cancels workflows for a PR', async function () {
    const resp = await createSlackAppMention(
      fastify,
      'gha cancel https://github.com/getsentry/sentry/pull/123'
    );

    expect(resp.statusCode).toBe(200);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':sentry-loading: Cancelling jobs...',
      })
    );

    // Fetch pull request details
    expect(octokit.pulls.get).toHaveBeenCalledTimes(1);
    expect(octokit.pulls.get).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      pull_number: 123,
    });

    // List workflow runs for branch
    expect(octokit.actions.listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(octokit.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      branch: 'head_ref',
    });

    // Jobs cancelled
    expect(octokit.actions.cancelWorkflowRun).toHaveBeenCalledTimes(2);
    expect(octokit.actions.cancelWorkflowRun).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      run_id: 2,
    });
    expect(octokit.actions.cancelWorkflowRun).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      run_id: 3,
    });
    expect(bolt.client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':sentry-loading: Cancelling 2 workflow: job 1, job 2',
      })
    );
    expect(bolt.client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':successkid: Cancelled 2 workflow: job 1, job 2',
      })
    );
  });

  it('tries to cancel with invalid argument', async function () {
    await createSlackAppMention(
      fastify,
      'gha cancel https://github.com/getsentry/sentry/invalid/123'
    );

    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Unable to find PR to cancel, please use the full PR URL',
      })
    );

    expect(octokit.pulls.get).toHaveBeenCalledTimes(0);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Unable to find PR to cancel, please use the full PR URL',
      })
    );
  });
});
