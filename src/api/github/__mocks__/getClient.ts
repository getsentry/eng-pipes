export function getOctokitClient() {
  return {
    orgs: {
      checkMembershipForUser: jest.fn(
        (org, user) => org === 'Enterprise' && user === 'Picard'
      ),
    },
  };
}

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
const getsentry = getMock();
export async function getClient(owner: string, repo: string) {
  return Promise.resolve(repo === 'getsentry' ? getsentry : sentry);
}
