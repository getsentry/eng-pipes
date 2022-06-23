import * as Sentry from '@sentry/node';

import { workflow_run_job } from '@test/payloads/github/workflow_run_job';

import { GETSENTRY_REPO, OWNER } from '@/config';
import { getClient } from '@api/github/getClient';

import { rerunFlakeyJobs } from './rerunFlakeyJobs';

describe('requiredChecks.rerunFlakeyJobs', function () {
  let octokit;

  beforeAll(async function () {
    octokit = await getClient(OWNER);
  });
  beforeEach(function () {
    octokit.actions.getJobForWorkflowRun.mockClear();
    octokit.request.mockClear();
  });

  it('restarts workflow once if it has already been restarted by a different job', async function () {
    octokit.actions.getJobForWorkflowRun.mockImplementation(
      async ({ job_id }) => {
        const data = workflow_run_job({ job_id });

        const setupStep = data.steps.find(
          ({ name }) => name === 'Setup Getsentry'
        );
        setupStep.conclusion = 'failed';
        data.conclusion = 'failed';

        return {
          data,
        };
      }
    );
    // Both of these jobs will have same workflow id
    await rerunFlakeyJobs([1, 2]);

    expect(octokit.request).toHaveBeenCalled();
  });

  it('restarts multiple workflows', async function () {
    octokit.actions.getJobForWorkflowRun.mockImplementation(
      async ({ job_id }) => {
        const data = workflow_run_job(
          { job_id },
          {
            // Make sure the jobs have different workflow ids so both workflows will get restarted
            run_id: job_id === 1 ? 111 : 222,
          }
        );

        const setupStep = data.steps.find(
          ({ name }) => name === 'Setup Getsentry'
        );
        setupStep.conclusion = 'failed';
        data.conclusion = 'failed';

        return {
          data,
        };
      }
    );

    await rerunFlakeyJobs([1, 2]);

    expect(octokit.request).toHaveBeenCalledTimes(2);
    expect(octokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
      {
        owner: OWNER,
        repo: GETSENTRY_REPO,
        run_id: 111,
      }
    );
    expect(octokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
      {
        owner: OWNER,
        repo: GETSENTRY_REPO,
        run_id: 222,
      }
    );
  });

  it('does not restart if this is not the first run attempt', async function () {
    octokit.actions.getJobForWorkflowRun.mockImplementation(
      async ({ job_id }) => {
        return { data: workflow_run_job({ job_id }, { run_attempt: 3 }) };
      }
    );

    await rerunFlakeyJobs([1, 2]);

    expect(octokit.request).not.toHaveBeenCalled();
  });

  it('restarts the correct workflows when certain job steps fail', async function () {
    octokit.actions.getJobForWorkflowRun.mockImplementation(
      async ({ job_id }) => {
        const data = workflow_run_job(
          { job_id },
          {
            run_id: job_id * 10,
          }
        );

        if (job_id === 1) {
          data.steps.unshift({
            name: 'Set up job',
            status: 'completed',
            conclusion: 'failed',
            number: 1,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          });
        } else if (job_id === 2) {
          data.steps.unshift({
            name: 'Setup Sentry',
            status: 'completed',
            conclusion: 'failed',
            number: 1,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          });
        } else if (job_id === 3) {
          data.steps = data.steps.map((step) => ({
            ...step,
            conclusion: 'success',
          }));
        } else if (job_id === 4) {
          data.steps = data.steps.map((step) => ({
            ...step,
            status: 'in_progress',
            conclusion: null,
          }));
          data.steps.push({
            name: 'A new step',
            status: 'completed',
            conclusion: 'failed',
            number: data.steps.length + 1,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          });
        }

        return { data };
      }
    );

    await rerunFlakeyJobs([1, 2, 3, 4]);

    // Only called when "Set up job" and "Setup Sentry" fails
    expect(octokit.request).toHaveBeenCalledTimes(2);
  });

  it('records the failed step name to Sentry', async function () {
    jest.spyOn(Sentry, 'startTransaction');
    Sentry.startTransaction.mockImplementation(
      jest.fn(() => ({
        finish: jest.fn(),
      }))
    );
    const setTagMock = jest.fn();
    jest.spyOn(Sentry, 'withScope').mockImplementation((fn) => {
      fn({
        setTag: setTagMock,
      });
    });

    octokit.actions.getJobForWorkflowRun.mockImplementation(
      async ({ job_id }) => {
        const data = workflow_run_job(
          { job_id },
          {
            run_id: job_id * 10,
          }
        );

        data.steps = [
          {
            name: 'Initial step',
            status: 'completed',
            conclusion: 'success',
            number: 1,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          },
          {
            name: 'Set up job',
            status: 'completed',
            conclusion: 'failed',
            number: 2,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          },
          {
            name: 'Setup Sentry',
            status: 'completed',
            conclusion: 'failed',
            number: 3,
            started_at: '2021-12-01T18:24:55.000Z',
            completed_at: '2021-12-01T18:24:58.000Z',
          },
        ];

        return { data };
      }
    );

    await rerunFlakeyJobs([1]);

    expect(Sentry.startTransaction).toHaveBeenCalledTimes(1);
    expect(Sentry.startTransaction).toHaveBeenCalledWith({
      name: 'requiredChecks.failedStep',
    });
    expect(setTagMock).toHaveBeenCalledWith('stepName', 'Set up job');

    Sentry.startTransaction.mockRestore();
    Sentry.withScope.mockRestore();
  });
});
