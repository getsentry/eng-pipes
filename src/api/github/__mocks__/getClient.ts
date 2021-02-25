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
      checkMembershipForUser: jest.fn(function (x) {
        let status = 302;
        if (x.org === 'Enterprise') {
          if (x.username === 'Picard') {
            status = 204;
          } else {
            status = 404;
          }
        }
        return { status: status };
      }),
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
