function getMock() {
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

const sentry = getMock();
const getSentry = getMock();
export async function getClient(owner: string, repo: string) {
  return Promise.resolve(repo === 'sentry' ? sentry : getSentry);
}
