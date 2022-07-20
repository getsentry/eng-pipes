import { GETSENTRY_BOT_ID } from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';

import { getSentryPullRequestsForGetsentryRange } from './getSentryPullRequestsForGetsentryRange';

describe('getSentryPullRequestsForGetsentryRange', function () {
  let getsentry;

  beforeAll(async function () {});

  afterAll(async function () {});

  beforeEach(async function () {
    getsentry = await getClient(ClientType.App, 'getsentry');
  });

  afterEach(function () {
    [getsentry].forEach((c) => {
      c.git.getCommit.mockClear();
      c.repos.listPullRequestsAssociatedWithCommit.mockClear();
      c.repos.compareCommits.mockClear();
    });
  });

  it('single commit, sentry', async function () {
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      ({ repo }) => {
        if (repo === 'sentry') {
          return {
            status: 200,
            data: [{ foo: 1 }],
          };
        }
        return undefined;
      }
    );
    getsentry.git.getCommit.mockImplementation(() => ({
      status: 200,
      data: {
        committer: {
          id: GETSENTRY_BOT_ID,
          email: 'bot@getsentry.com',
        },
        message: 'getsentry/sentry@2188f0485424da597dcca9e12093d253ddc67c0a',
      },
    }));

    expect(await getSentryPullRequestsForGetsentryRange('f00123')).toEqual([
      { foo: 1 },
    ]);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });

  it('multiple commits, sentry', async function () {
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      ({ repo }) => {
        if (repo === 'sentry') {
          return {
            status: 200,
            data: [{ foo: 1 }],
          };
        }
        return undefined;
      }
    );

    getsentry.repos.compareCommits.mockImplementation(() => ({
      status: 200,
      data: {
        commits: [
          {
            committer: {
              id: GETSENTRY_BOT_ID,
              email: 'bot@getsentry.com',
            },
            commit: {
              message:
                'getsentry/sentry@2188f0485424da597dcca9e12093d253ddc67c0a',
            },
          },
        ],
      },
    }));

    expect(
      await getSentryPullRequestsForGetsentryRange('f00123', 'deadbeef')
    ).toEqual([{ foo: 1 }]);
    expect(getsentry.repos.compareCommits).toHaveBeenLastCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      base: 'deadbeef',
      head: 'f00123',
    });
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });

  it('single commit, getsentry', async function () {
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      ({ repo }) => {
        if (repo === 'getsentry') {
          return {
            status: 200,
            data: [{ foo: 1 }],
          };
        }
        return undefined;
      }
    );
    getsentry.git.getCommit.mockImplementation(() => ({
      status: 200,
      data: {
        committer: {
          id: '123',
          email: 'mars@sentry.io',
        },
        message: 'feat: land on mars',
      },
    }));
    expect(
      await getSentryPullRequestsForGetsentryRange('f00123', null, true)
    ).toEqual([{ foo: 1 }]);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      commit_sha: 'f00123',
    });
  });

  it('multiple commits, getsentry', async function () {
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      ({ repo }) => {
        return repo === 'getsentry'
          ? { data: [{ bar: 2 }] }
          : { data: [{ foo: 1 }] };
      }
    );
    getsentry.repos.compareCommits.mockImplementation(() => ({
      status: 200,
      data: {
        commits: [
          {
            sha: '982345',
            committer: {
              id: GETSENTRY_BOT_ID,
              email: 'bot@getsentry.com',
            },
            commit: {
              message:
                'getsentry/sentry@2188f0485424da597dcca9e12093d253ddc67c0a',
            },
          },
          {
            sha: '99999999',
            committer: {
              id: '123',
              email: 'mars@sentry.io',
            },
            commit: {
              message: 'feat: lands on mars',
            },
          },
        ],
      },
    }));
    expect(
      await getSentryPullRequestsForGetsentryRange('f00123', 'deadbeef', true)
    ).toEqual([{ foo: 1 }, { bar: 2 }]);
    expect(getsentry.repos.compareCommits).toHaveBeenLastCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      base: 'deadbeef',
      head: 'f00123',
    });
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(2);

    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });
});
