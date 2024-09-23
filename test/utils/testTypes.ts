import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
} from '@/types';

// Mocked Github Org for Jest
export type MockedGithubOrg = {
  api: MockedGitHubAPI;
  slug: string;
  appAuth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;
  repos: any;
  getAllProjectFieldNodeIds: jest.Mock;
  addIssueToGlobalIssuesProject: jest.Mock;
  modifyProjectIssueField: jest.Mock;
  clearProjectIssueField: jest.Mock;
  modifyDueByDate: jest.Mock;
  getIssueDetailsFromNodeId: jest.Mock;
  getKeyValueFromProjectField: jest.Mock;
  getIssueDueDateFromProject: jest.Mock;
};

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
    listComments: jest.Mock;
    listForRepo: jest.Mock;
    update: jest.Mock;
    _labels: Set<string>;
    _comments: string[];
  };
  teams: {
    getByName: jest.Mock;
  };
  graphql: jest.Mock;
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
