import moment from 'moment-timezone';

import { STALE_LABEL } from '@/config';
import { GH_APPS } from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';

import { triggerStaleBot } from './stalebot';

jest.mock('@/config', () => {
  const actualEnvVariables = jest.requireActual('@/config');
  return {
    ...actualEnvVariables,
    SENTRY_SDK_REPOS: [],
    SENTRY_MONOREPOS: ['test-sentry-repo'],
  };
});

describe('Stalebot Tests', function () {
  const app = GH_APPS.load('__tmp_org_placeholder__');

  const issueInfo = {
    labels: [],
    updated_at: '2023-04-05T15:51:22Z',
  };
  let octokit;

  beforeEach(async function () {
    octokit = {
      ...(await getClient(ClientType.App, 'Enterprise')),
      paginate: (a, b) => a(b),
    };
  });

  afterEach(async function () {
    octokit.issues._labels = new Set([]);
    octokit.issues.addLabels.mockClear();
    octokit.issues.removeLabel.mockClear();
    octokit.issues._comments = [];
    octokit.issues.createComment.mockClear();
    octokit.teams.getByName.mockClear();
    jest.clearAllMocks();
  });

  it('should mark issue as stale if it has been over 3 weeks', async function () {
    octokit.issues.listForRepo = () => [issueInfo];
    await triggerStaleBot(app, octokit, moment('2023-04-27T14:28:13Z').utc());
    expect(octokit.issues._labels).toContain(STALE_LABEL);
    expect(octokit.issues._comments).toEqual([
      `This issue has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you remove the label \`Waiting for: Community\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
    ]);
  });

  it('should not mark issue as stale if it has been under 3 weeks', async function () {
    octokit.issues.listForRepo = () => [issueInfo];
    await triggerStaleBot(app, octokit, moment('2023-04-10T14:28:13Z').utc());
    expect(octokit.issues._labels).not.toContain(STALE_LABEL);
    expect(octokit.issues._comments).toEqual([]);
  });

  it('should not mark PR as stale if it has been under 3 weeks', async function () {
    octokit.issues.listForRepo = () => [{ ...issueInfo, pull_request: {} }];
    await triggerStaleBot(app, octokit, moment('2023-04-10T14:28:13Z').utc());
    expect(octokit.issues._labels).not.toContain(STALE_LABEL);
    expect(octokit.issues._comments).toEqual([]);
  });

  it('should mark PR as stale if it has been over 3 weeks', async function () {
    octokit.issues.listForRepo = () => [{ ...issueInfo, pull_request: {} }];
    await triggerStaleBot(app, octokit, moment('2023-04-27T14:28:13Z').utc());
    expect(octokit.issues._labels).toContain(STALE_LABEL);
    expect(octokit.issues._comments).toEqual([
      `This pull request has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you remove the label \`Waiting for: Community\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
    ]);
  });

  it('should close issue if there is no activity after a week and an issue is stale', async function () {
    const issueUpdateSpy = jest.spyOn(octokit.issues, 'update');
    octokit.issues.listForRepo = () => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ];
    await triggerStaleBot(app, octokit, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toHaveBeenCalledWith({
      issue_number: undefined,
      owner: 'getsentry',
      repo: 'test-sentry-repo',
      state: 'closed',
    });
  });

  it('should not close issue if there is no activity under a week and an issue is stale', async function () {
    const issueUpdateSpy = jest.spyOn(octokit.issues, 'update');
    octokit.issues.listForRepo = () => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ];
    await triggerStaleBot(app, octokit, moment('2023-04-06T14:28:13Z').utc());
    expect(issueUpdateSpy).toBeCalledTimes(0);
  });

  it('should remove stale label if there is activity but stale label exists on issue', async function () {
    const issueUpdateSpy = jest.spyOn(octokit.issues, 'update');
    octokit.issues.listForRepo = () => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL],
      },
    ];
    await triggerStaleBot(app, octokit, moment('2023-04-06T14:28:13Z').utc());
    expect(octokit.issues._labels).not.toContain(STALE_LABEL);
  });
});
