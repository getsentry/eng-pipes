import { OAuth2Client } from 'google-auth-library';
import moment from 'moment-timezone';

import { GETSENTRY_ORG, STALE_LABEL } from '@/config';

import { MockedGithubOrg } from '../../../test/utils/testTypes';
import {
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WORK_IN_PROGRESS_LABEL,
} from '../../config';

import { triggerStaleBot } from './stalebot';

const FAKE_MERGE_COMMIT = '12345';

describe('Stalebot Tests', function () {
  const org = GETSENTRY_ORG as unknown as MockedGithubOrg;
  let origRepos;

  const issueInfo = {
    labels: [WAITING_FOR_COMMUNITY_LABEL],
    updated_at: '2023-04-05T15:51:22Z',
  };

  beforeAll(function () {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(jest.fn());
  });

  beforeEach(async function () {
    origRepos = org.repos.all;
    org.repos.all = ['test-sentry-repo'];
    org.api.paginate = jest.fn((a, b) => a(b));
  });

  afterEach(async function () {
    org.repos.all = origRepos;
    org.api.issues._labels = new Set([]);
    org.api.issues.addLabels.mockClear();
    org.api.issues.removeLabel.mockClear();
    org.api.issues._comments = [];
    org.api.issues.createComment.mockClear();
    org.api.teams.getByName.mockClear();
    jest.clearAllMocks();
  });

  it('should mark issue as stale if it has been over 3 weeks', async function () {
    org.api.issues.listForRepo = jest.fn(() => [issueInfo]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([
      `This issue has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you remove the label \`Waiting for: Community\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
    ]);
  });

  it('should not mark issue as stale if it has been under 3 weeks', async function () {
    org.api.issues.listForRepo = jest.fn(() => [issueInfo]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-10T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should not mark PR as stale if it has been under 3 weeks', async function () {
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(() => [
      { ...issueInfo, merge_commit_sha: FAKE_MERGE_COMMIT },
    ]);
    await triggerStaleBot(org, moment('2023-04-10T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should mark PR as stale in routing-repo if it has been over 3 weeks', async function () {
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withRouting.includes(repo)
        ? [{ ...issueInfo, merge_commit_sha: FAKE_MERGE_COMMIT }]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([
      `This pull request has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you add the label \`WIP\`, I will leave it alone unless \`WIP\` is removed ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
    ]);
  });

  it('should not mark PR as stale in routing-repo if it has been over 3 weeks but has WIP label', async function () {
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withRouting.includes(repo)
        ? [
            {
              ...issueInfo,
              labels: [WAITING_FOR_COMMUNITY_LABEL, WORK_IN_PROGRESS_LABEL],
              merge_commit_sha: FAKE_MERGE_COMMIT,
            },
          ]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should not mark PR as stale in repos without routing if it has been over 3 weeks', async function () {
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withoutRouting.includes(repo)
        ? [{ ...issueInfo, merge_commit_sha: FAKE_MERGE_COMMIT }]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should not close stale PR that has no activity for less than a week and has `Stale` label', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withRouting.includes(repo)
        ? [{ ...issueInfo, labels: [STALE_LABEL] }]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-10T14:28:13Z').utc());
    expect(issueUpdateSpy).toHaveBeenCalledTimes(0);
  });

  it('should remove stale label on PR that has activity in the past day', async function () {
    const removeLabelSpy = jest.spyOn(org.api.issues, 'removeLabel');
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withRouting.includes(repo)
        ? [{ ...issueInfo, labels: [STALE_LABEL] }]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-06T00:28:13Z').utc());
    expect(removeLabelSpy).toHaveBeenCalledTimes(1);
  });

  it('should close PR if there is no activity after a week and issue has label `Stale`', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = jest.fn(() => []);
    org.api.pulls.list = jest.fn(({ repo }) => {
      return org.repos.withRouting.includes(repo)
        ? [{ ...issueInfo, labels: [STALE_LABEL] }]
        : [];
    });
    await triggerStaleBot(org, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toHaveBeenCalledTimes(1);
    expect(issueUpdateSpy).toHaveBeenCalledWith({
      issue_number: undefined,
      owner: 'getsentry',
      repo: 'routing-repo',
      state_reason: 'not_planned',
      state: 'closed',
    });
  });

  it('should not close stale issue that has been inactive for more than a week and does not have label `Waiting for: Community`', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = jest.fn(() => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toBeCalledTimes(0);
  });

  it('should close issue if there is no activity after a week and issue has label `Waiting for: Community`', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = jest.fn(() => [
      { ...issueInfo, labels: [STALE_LABEL, WAITING_FOR_COMMUNITY_LABEL] },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toHaveBeenCalledWith({
      issue_number: undefined,
      owner: 'getsentry',
      repo: 'test-sentry-repo',
      state_reason: 'not_planned',
      state: 'closed',
    });
  });

  it('should not close issue if there is no activity under a week and issue is stale', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = jest.fn(() => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-06T14:28:13Z').utc());
    expect(issueUpdateSpy).toBeCalledTimes(0);
  });

  it('should remove stale label if there is activity but stale label exists on issue', async function () {
    org.api.issues.listForRepo = jest.fn(() => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL],
      },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-06T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
  });

  it('should remove stale label if there is no activity recently but issue does not have `Waiting for: Community`', async function () {
    org.api.issues.listForRepo = jest.fn(() => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL],
      },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
  });

  it('should not remove stale label if there is no activity recently and issue has label `Waiting for: Community`', async function () {
    org.api.issues.listForRepo = jest.fn(() => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL, WAITING_FOR_COMMUNITY_LABEL],
      },
    ]);
    org.api.pulls.list = jest.fn(() => []);
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).toContain(STALE_LABEL);
  });
});
