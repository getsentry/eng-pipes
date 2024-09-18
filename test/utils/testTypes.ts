// Mocked GitHub API for Jest
export type MockedGitHubAPI = {
  checks: {
    listForRef: jest.Mock;
    listAnnotations: jest.Mock;
  };
  repos: {
    getCommit: jest.Mock;
    compareCommits: jest.Mock;
    getContent: jest.Mock;
  };
  paginate: jest.Mock;
  pulls: {
    get: jest.Mock;
    list: jest.Mock;
    merge: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  actions: {
    listWorkflowRunsForRepo: jest.Mock;
    cancelWorkflowRun: jest.Mock;
  };
  orgs: {
    checkMembershipForUser: jest.Mock;
  };
  issues: {
    createComment: jest.Mock;
    addLabels: jest.Mock;
    removeLabel: jest.Mock;
    _labels: Set<string>;
    _comments: string[];
  };
  teams: {
    getByName: jest.Mock;
  };
};

// Mocked Slack API for Jest
export type MockedBolt = {
  client: {
    chat: {
      postMessage: jest.Mock;
      update: jest.Mock;
    };
    views: {
      open: jest.Mock;
      publish: jest.Mock;
      update: jest.Mock;
    };
  };
};
