import { DATADOG_API_INSTANCE } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

jest.mock('@utils/db/githubUserDirectory', () => ({
  fetchGithubUserDirectory: jest.fn(),
}));

import { fetchGithubUserDirectory } from '@utils/db/githubUserDirectory';

import { syncGithubUsers } from './syncGithubUsers';

describe('syncGithubUsers', function () {
  let datadogSpy;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(function () {
    datadogSpy = jest
      .spyOn(DATADOG_API_INSTANCE, 'createEvent')
      .mockImplementation(jest.fn());
  });

  afterEach(async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockClear();
    jest.clearAllMocks();
    await db('users').delete();
  });

  it('upserts a row when Slack resolves the email', async function () {
    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'test@sentry.io', githubUsername: 'alice-gh' },
    ]);

    const counters = await syncGithubUsers();

    expect(counters).toEqual({
      total: 1,
      upserted: 1,
      slackMisses: 0,
      errors: 0,
    });

    const row = await db('users').where('email', 'test@sentry.io').first('*');
    expect(row).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123',
      githubUser: 'alice-gh',
    });
  });

  it('merges into an existing row on email conflict', async function () {
    await db('users').insert({
      email: 'test@sentry.io',
      slackUser: 'U_OLD',
      githubUser: 'stale-gh',
    });

    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'test@sentry.io', githubUsername: 'fresh-gh' },
    ]);

    await syncGithubUsers();

    const rows = await db('users').where('email', 'test@sentry.io').select('*');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'test@sentry.io',
      slackUser: 'U789123', // refreshed from Slack lookup
      githubUser: 'fresh-gh',
    });
  });

  it('normalizes github.com URLs in the github_username column', async function () {
    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      {
        email: 'test@sentry.io',
        githubUsername: 'https://github.com/alice-gh',
      },
    ]);

    await syncGithubUsers();

    const row = await db('users').where('email', 'test@sentry.io').first('*');
    expect(row?.githubUser).toBe('alice-gh');
  });

  it('counts a slackMiss when lookupByEmail returns no user', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce(
      Promise.resolve({ ok: false })
    );

    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'ghost@sentry.io', githubUsername: 'ghost-gh' },
    ]);

    const counters = await syncGithubUsers();

    expect(counters).toEqual({
      total: 1,
      upserted: 0,
      slackMisses: 1,
      errors: 0,
    });

    const row = await db('users').where('email', 'ghost@sentry.io').first('*');
    expect(row).toBeUndefined();
  });

  it('counts a slackMiss when the Slack user fails the Sentry-employee gate', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        user: {
          id: 'U_BOT',
          profile: { email: 'bot@sentry.io' },
          is_bot: true,
        },
      })
    );

    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'bot@sentry.io', githubUsername: 'bot-gh' },
    ]);

    const counters = await syncGithubUsers();

    expect(counters.slackMisses).toBe(1);
    expect(counters.upserted).toBe(0);
  });

  it('counts per-row failures without aborting the whole run', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail
      .mockReturnValueOnce(Promise.reject(new Error('rate limited')))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          user: { id: 'U789123', profile: { email: 'bob@sentry.io' } },
        })
      );

    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
      { email: 'bob@sentry.io', githubUsername: 'bob-gh' },
    ]);

    const counters = await syncGithubUsers();

    expect(counters).toEqual({
      total: 2,
      upserted: 1,
      slackMisses: 0,
      errors: 1,
    });
  });

  it('emits a Datadog event summarizing the run', async function () {
    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'test@sentry.io', githubUsername: 'alice-gh' },
    ]);

    await syncGithubUsers();

    expect(datadogSpy).toHaveBeenCalledTimes(1);
    const body = datadogSpy.mock.calls[0][0].body;
    expect(body.title).toBe('eng-pipes sync-github-users');
    expect(body.alertType).toBe('info');
    expect(body.text).toContain('total=1');
    expect(body.text).toContain('upserted=1');
    expect(body.tags).toEqual(
      expect.arrayContaining(['job:sync-github-users', 'source:eng-pipes'])
    );
    expect(body.tags).not.toContain('dry_run:true');
  });

  it('skips the DB write but counts would-have-upserted when DRY_RUN is set', async function () {
    const originalDryRun = process.env.DRY_RUN;
    process.env.DRY_RUN = 'true';
    try {
      (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
        { email: 'test@sentry.io', githubUsername: 'alice-gh' },
      ]);

      const counters = await syncGithubUsers();

      expect(counters).toEqual({
        total: 1,
        upserted: 1,
        slackMisses: 0,
        errors: 0,
      });

      // No actual row was written.
      const row = await db('users').where('email', 'test@sentry.io').first('*');
      expect(row).toBeUndefined();

      // Datadog event carries the dry_run tag so dashboards can filter.
      expect(datadogSpy).toHaveBeenCalledTimes(1);
      expect(datadogSpy.mock.calls[0][0].body.tags).toContain('dry_run:true');
    } finally {
      if (originalDryRun === undefined) {
        delete process.env.DRY_RUN;
      } else {
        process.env.DRY_RUN = originalDryRun;
      }
    }
  });
});
