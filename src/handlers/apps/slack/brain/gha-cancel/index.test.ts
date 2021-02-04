import { buildServer } from '@app/buildServer';
import { createSlackMessage } from '@test/utils/createSlackMessage';
import { web } from '@api/slack';
import { getClient } from '@api/github/getClient';

jest.mock('@api/slack');
jest.mock('@api/github/getClient');

describe('gha-test', function () {
  let fastify;
  let octokit;

  beforeEach(async function () {
    octokit = await getClient('', '');
    fastify = buildServer(false);
    // @ts-ignore
    web.chat.postMessage.mockClear();
    // @ts-ignore
    web.chat.update.mockClear();
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

  afterEach(function () {
    fastify.close();
  });

  it('cancels workflows for a PR', async function () {
    const resp = await createSlackMessage(
      fastify,
      'gha cancel https://github.com/getsentry/sentry/pull/123'
    );

    expect(resp.statusCode).toBe(200);

    expect(web.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':fidget_spinner_right: Cancelling jobs...',
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
    expect(web.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':fidget_spinner_right: Cancelling 2 workflow: job 1, job 2',
      })
    );
    expect(web.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ':successkid: Cancelled 2 workflow: job 1, job 2',
      })
    );
  });

  it('tries to cancel with invalid argument', async function () {
    await createSlackMessage(
      fastify,
      'gha cancel https://github.com/getsentry/sentry/invalid/123'
    );

    expect(web.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Unable to find PR to cancel, please use the full PR URL',
      })
    );

    expect(octokit.pulls.get).toHaveBeenCalledTimes(0);
    expect(web.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Unable to find PR to cancel, please use the full PR URL',
      })
    );
  });
});
