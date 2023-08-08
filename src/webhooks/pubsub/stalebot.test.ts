import moment from 'moment-timezone';

import { GETSENTRY_ORG, STALE_LABEL } from '@/config';

import {
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '../../config';

import { triggerStaleBot } from './stalebot';

describe('Stalebot Tests', function () {
  const org = GETSENTRY_ORG;
  let origRepos;

  const issueInfo = {
    labels: [WAITING_FOR_COMMUNITY_LABEL],
    updated_at: '2023-04-05T15:51:22Z',
  };

  beforeEach(async function () {
    origRepos = org.repos.all;
    org.repos.all = ['test-sentry-repo'];
    org.api.paginate = (a, b) => a(b);
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
    org.api.issues.listForRepo = () => [issueInfo];
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
    org.api.issues.listForRepo = () => [issueInfo];
    await triggerStaleBot(org, moment('2023-04-10T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should not mark PR as stale if it has been under 3 weeks', async function () {
    org.api.issues.listForRepo = () => [{ ...issueInfo, pull_request: {} }];
    await triggerStaleBot(org, moment('2023-04-10T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([]);
  });

  it('should mark PR as stale if it has been over 3 weeks', async function () {
    org.api.issues.listForRepo = () => [{ ...issueInfo, pull_request: {} }];
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).toContain(STALE_LABEL);
    expect(org.api.issues._comments).toEqual([
      `This pull request has gone three weeks without activity. In another week, I will close it.

But! If you comment or otherwise update it, I will reset the clock, and if you remove the label \`Waiting for: Community\`, I will leave it alone ... forever!

----

"A weed is but an unloved flower." ― _Ella Wheeler Wilcox_ 🥀`,
    ]);
  });

  it('should not close stale issue that has been inactive for more than a week and does not have label `Waiting for: Community`', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = () => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ];
    await triggerStaleBot(org, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toBeCalledTimes(0);
  });

  it('should close issue if there is no activity after a week and issue has label `Waiting for: Community`', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = () => [
      { ...issueInfo, labels: [STALE_LABEL, WAITING_FOR_COMMUNITY_LABEL] },
    ];
    await triggerStaleBot(org, moment('2023-04-13T14:28:13Z').utc());
    expect(issueUpdateSpy).toHaveBeenCalledWith({
      issue_number: undefined,
      owner: 'getsentry',
      repo: 'test-sentry-repo',
      state: 'closed',
    });
  });

  it('should not close issue if there is no activity under a week and issue is stale', async function () {
    const issueUpdateSpy = jest.spyOn(org.api.issues, 'update');
    org.api.issues.listForRepo = () => [
      { ...issueInfo, labels: [STALE_LABEL] },
    ];
    await triggerStaleBot(org, moment('2023-04-06T14:28:13Z').utc());
    expect(issueUpdateSpy).toBeCalledTimes(0);
  });

  it('should remove stale label if there is activity but stale label exists on issue', async function () {
    org.api.issues.listForRepo = () => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL],
      },
    ];
    await triggerStaleBot(org, moment('2023-04-06T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
  });

  it('should remove stale label if there is no activity recently but issue does not have `Waiting for: Community`', async function () {
    org.api.issues.listForRepo = () => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL],
      },
    ];
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).not.toContain(STALE_LABEL);
  });

  it('should not remove stale label if there is no activity recently and issue has label `Waiting for: Community`', async function () {
    org.api.issues.listForRepo = () => [
      {
        ...issueInfo,
        updated_at: '2023-04-06T10:28:13Z',
        labels: [STALE_LABEL, WAITING_FOR_COMMUNITY_LABEL],
      },
    ];
    await triggerStaleBot(org, moment('2023-04-27T14:28:13Z').utc());
    expect(org.api.issues._labels).toContain(STALE_LABEL);
  });
});
