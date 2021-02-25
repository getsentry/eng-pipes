function mockClient() {
  return {
    actions: {
      listWorkflowRunsForRepo: jest.fn(),
      cancelWorkflowRun: jest.fn(),
    },
    git: {
      getCommit: jest.fn(),
    },
    orgs: {
      checkMembershipForUser: jest.fn(
        (x) => x.org === 'Enterprise' && x.username === 'Picard'
      ),
    },
    pulls: {
      get: jest.fn(),
    },
    repos: {
      getCommit: jest.fn(),
      listPullRequestsAssociatedWithCommit: jest.fn(),
      compareCommits: jest.fn(),
    },
  };
}

const mocks = {
  sentry: mockClient(),
  getsentry: mockClient(),
  undefined: mockClient(),
};

export async function getClient(owner?: string, repo?: string) {
  return mocks[repo || 'undefined'];
}
