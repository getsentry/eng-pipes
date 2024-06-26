import MockCompareCommits from '@test/compareCommits.json';
import { workflow_run_job } from '@test/payloads/github/workflow_run_job';

import { MockOctokitError } from './mockError';

// Looks goofy, don't it? This is what I could figure out to mock a class. I
// tried a lot of stuff following these docs and couldn't figure it out other
// than this:
//
//   https://jestjs.io/docs/27.x/es6-class-mocks
//   https://jestjs.io/docs/27.x/mock-function-api#jestmockedclass

export const OctokitWithRetries = jest.fn(() => {
  return OctokitWithRetries;
});

OctokitWithRetries.actions = {
  listWorkflowRunsForRepo: jest.fn(),
  cancelWorkflowRun: jest.fn(),
  getJobForWorkflowRun: jest.fn(async ({ job_id }) => {
    return { data: workflow_run_job({ job_id }) };
  }),
};

OctokitWithRetries.apps = {
  getOrgInstallation: jest.fn(async ({ org }) => {
    return {
      data: {
        id: `installation-${org}`,
      },
    };
  }),
};

OctokitWithRetries.checks = {
  listForRef: jest.fn(),
  listAnnotations: jest.fn(async () => {
    return {
      data: [
        {
          path: 'tests/snuba/rules/conditions/test_event_frequency.py',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py',
          start_line: 570,
          start_column: null,
          end_line: 570,
          end_column: null,
          annotation_level: 'failure',
          title: 'tests/snuba/rules/conditions/test_event_frequency.py#L570',
          message:
            'EventFrequencyPercentConditionTestCase.test_one_hour_with_events\n' +
            '\n' +
            'AssertionError',
          raw_details: null,
        },
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'Process completed with exit code 2.',
          raw_details: null,
        },
      ],
    };
  }),
};

OctokitWithRetries.git = {
  getCommit: jest.fn(),
};

OctokitWithRetries.graphql = jest.fn();

OctokitWithRetries.issues = {
  _labels: new Set([]),
  _comments: [],
  addLabels: jest.fn(async function (payload) {
    for (const name of payload.labels) {
      this._labels.add(name);
    }
  }),
  removeLabel: jest.fn(async function (payload) {
    this._labels.delete(payload.name);
  }),
  createComment: jest.fn(async function (payload) {
    this._comments.push(payload.body);
  }),
  get: jest.fn(),
  update: jest.fn(),
};

OctokitWithRetries.orgs = {
  checkMembershipForUser: jest.fn(async function ({ org, username }) {
    let status = 302;
    if (org === 'getsentry' || org === null) {
      if (username === 'Picard' || username === 'Troi') {
        return { status: 204 };
      } else {
        status = 404;
      }
    }
    throw new MockOctokitError(status);
  }),
};

OctokitWithRetries.paginate = jest.fn();

OctokitWithRetries.pulls = {
  get: jest.fn(),
};

OctokitWithRetries.repos = {
  getCommit: jest.fn(),

  listPullRequestsAssociatedWithCommit: jest.fn(),

  getContent: jest.fn(),

  compareCommits: jest.fn(({ base, head }) => {
    // If base is older than head, then status will be ahead
    // For tests it might be easier to think of base/head as incrementing
    // ints (representing age) instead of a hash
    const isAhead = !base && !head ? true : base < head ? true : false;
    const commits = MockCompareCommits.data.commits;
    const oldestCommit = {
      ...commits[0],
      sha: isAhead ? base ?? commits[0].sha : null,
    };
    const newestCommit = {
      ...commits[1],
      sha: isAhead ? head ?? commits[1].sha : null,
    };
    const mockCommits = isAhead ? [oldestCommit, newestCommit] : [];
    const numCommits = mockCommits.length;

    return {
      ...MockCompareCommits,
      status: 200,
      data: {
        // If behind, there will be no commits in response
        commits: mockCommits,
        status: isAhead ? 'ahead' : base === head ? 'identical' : 'behind',
        ahead_by: numCommits,
        behindBy: isAhead ? 0 : 2,
        total_commits: numCommits,
      },
    };
  }),
};

OctokitWithRetries.request = jest.fn(async (URL, x) => {
  if (URL.includes && URL.includes('/GTM/')) {
    let status = 302;
    if (x.org === 'getsentry' || x.org === null) {
      if (x.username === 'Troi') {
        return { status: 200 };
      } else {
        status = 404;
      }
    }
    throw new MockOctokitError(status);
  }
  return {};
});

OctokitWithRetries.teams = {
  getByName: jest.fn(async function (payload) {
    if (
      payload.team_slug === 'product-owners-test' ||
      payload.team_slug === 'product-owners-rerouted'
    ) {
      return { status: 200, data: {} };
    }
    throw new MockOctokitError(404);
  }),
};
