function mockBoundClient() {
  return {
    actions: {
      listWorkflowRunsForRepo: jest.fn(),
      cancelWorkflowRun: jest.fn(),
    },
    git: {
      getCommit: jest.fn(),
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

function mockUnboundClient() {
  return {
    orgs: {
      checkMembershipForUser: jest.fn(
        (org, user) => org === 'Enterprise' && user === 'Picard'
      ),
    },
  };
}

const mocks = {
  sentry: mockBoundClient(),
  getsentry: mockBoundClient(),
  undefined: mockUnboundClient(),
};

export async function getClient(owner?: string, repo?: string) {
  return mocks[repo || 'undefined'];
}
