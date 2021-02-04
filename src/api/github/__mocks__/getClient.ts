const mock = {
  actions: {
    listWorkflowRunsForRepo: jest.fn(),
    cancelWorkflowRun: jest.fn(),
  },
  pulls: {
    get: jest.fn(),
  },
  repos: {
    getCommit: jest.fn(),
  },
};

export async function getClient(owner, repo) {
  return Promise.resolve(mock);
}
