function mockClient() {
  return {
    actions: {
      listWorkflowRunsForRepo: jest.fn(),
      cancelWorkflowRun: jest.fn(),
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
        throw { status };
      }),
    },
    pulls: {
      get: jest.fn(),
    },
    repos: {
      getCommit: jest.fn(),
      listPullRequestsAssociatedWithCommit: jest.fn(),
      compareCommits: jest.fn(() => ({
        status: 200,
        data: {
          // Incomplete
          commits: [
            {
              sha: '455e3db9eb4fa6a1789b70e4045b194f02db0b59',
            },
            {
              sha: '1cd4f24731ceed16532c3206393f8628c6a755dd',
            },
          ],
        },
      })),
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
