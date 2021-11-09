import MockCompareCommits from '@test/compareCommits.json';

import { MockOctokitError } from './mockError';

function mockClient() {
  return {
    actions: {
      listWorkflowRunsForRepo: jest.fn(),
      cancelWorkflowRun: jest.fn(),
    },
    checks: {
      listForRef: jest.fn(),
    },
    git: {
      getCommit: jest.fn(),
    },
    issues: {
      _labels: new Set([]),
      addLabels: jest.fn(async function (payload) {
        for (const name of payload.labels) {
          this._labels.add(name);
        }
      }),
      removeLabel: jest.fn(async function (payload) {
        this._labels.delete(payload.name);
      }),
    },
    orgs: {
      checkMembershipForUser: jest.fn(async function (x) {
        let status = 302;
        if (x.org === 'Enterprise') {
          if (x.username === 'Picard') {
            return { status: 204 };
          } else {
            status = 404;
          }
        }
        throw new MockOctokitError(status);
      }),
    },
    pulls: {
      get: jest.fn(),
    },
    repos: {
      getCommit: jest.fn(),

      listPullRequestsAssociatedWithCommit: jest.fn(),

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
            status: isAhead ? 'ahead' : 'behind',
            ahead_by: numCommits,
            behindBy: isAhead ? 0 : 2,
            total_commits: numCommits,
          },
        };
      }),
    },
  };
}

const mocks = {};

export async function getClient(org?: string) {
  if (mocks[org]) {
    return mocks[org];
  }

  mocks[org] = mockClient();
  return mocks[org];
}
