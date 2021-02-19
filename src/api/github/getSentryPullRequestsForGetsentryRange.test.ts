jest.mock('@utils/loadBrain');
jest.mock('@api/github/getClient');

import merge from 'lodash.merge';

import { createGitHubEvent } from '@test/utils/createGitHubEvent';

import { buildServer } from '@/buildServer';
import {
  GETSENTRY_BOT_ID,
  REQUIRED_CHECK_CHANNEL,
  REQUIRED_CHECK_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { getSentryPullRequestsForGetsentryRange } from './getSentryPullRequestsForGetsentryRange';

describe('getSentryPullRequestsForGetsentryRange', function () {
  let sentry;
  let getsentry;

  beforeAll(async function () {});

  afterAll(async function () {});

  beforeEach(async function () {
    getsentry = await getClient('getsentry', 'getsentry');
    sentry = await getClient('getsentry', 'sentry');

    [getsentry, sentry].forEach((c) => {
      c.git.getCommit.mockClear();
      c.repos.listPullRequestsAssociatedWithCommit.mockClear();
      c.repos.compareCommits.mockClear();
    });
  });

  afterEach(function () {});

  it('single commit, sentry', async function () {
    sentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      () => ({
        data: [{ foo: 1 }],
      })
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
    ).not.toHaveBeenCalled()
    expect(
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1)
    expect(
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });

  it('multiple commits, sentry', async function () {
    sentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      () => ({ data: [{ foo: 1 }] })
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
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);
    expect(
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });


  it('single commit, getsentry', async function () {
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      () => ({
        data: [{ foo: 1 }],
      })
    );
    getsentry.git.getCommit.mockImplementation(() => ({
      status: 200,
      data: {
        committer: {
          id: '123'
          email: 'mars@sentry.io',
        },
        message: 'feat: land on mars',
      },
    }));
    expect(await getSentryPullRequestsForGetsentryRange('f00123', null, true)).toEqual([
      { foo: 1 },
    ]);
    expect(sentry.repos.listPullRequestsAssociatedWithCommit).not.toHaveBeenCalled();
    expect(getsentry.repos.listPullRequestsAssociatedWithCommit).toHaveBeenCalledTimes(1);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      commit_sha: 'f00123',
    });
  });

  it('multiple commits, getsentry', async function () {
    sentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      () => ({ data: [{ foo: 1 }] })
    );
    getsentry.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      () => ({ data: [{ bar: 2 }] })
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
              message:
                'feat: lands on mars',
            },
          },
        ],
      },
    }));
    expect(
      await getSentryPullRequestsForGetsentryRange('f00123', 'deadbeef', true)
    ).toEqual([{ foo: 1 }, {bar: 2}]);
    expect(getsentry.repos.compareCommits).toHaveBeenLastCalledWith({
      owner: 'getsentry',
      repo: 'getsentry',
      base: 'deadbeef',
      head: 'f00123',
    });
    expect(
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);
    expect(
      getsentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledTimes(1);

    expect(
      sentry.repos.listPullRequestsAssociatedWithCommit
    ).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry',
      commit_sha: '2188f0485424da597dcca9e12093d253ddc67c0a',
    });
  });
});
