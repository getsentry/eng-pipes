const mock = {
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

export async function getClient(owner, repo) {
  return Promise.resolve(mock);
}
