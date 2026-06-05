import { bolt } from '@api/slack';
import { db } from '@utils/db';

jest.mock('@utils/db/githubUserDirectory', () => ({
  fetchGithubUserDirectory: jest.fn(),
}));

import { fetchGithubUserDirectory } from '@utils/db/githubUserDirectory';

import { syncGithubUsers } from './syncGithubUsers';

describe('syncGithubUsers', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
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

    await syncGithubUsers();

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
      slackUser: 'U789123',
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

  it('skips when lookupByEmail returns no user', async function () {
    // @ts-ignore
    bolt.client.users.lookupByEmail.mockReturnValueOnce(
      Promise.resolve({ ok: false })
    );

    (fetchGithubUserDirectory as jest.Mock).mockResolvedValueOnce([
      { email: 'ghost@sentry.io', githubUsername: 'ghost-gh' },
    ]);

    await syncGithubUsers();

    const row = await db('users').where('email', 'ghost@sentry.io').first('*');
    expect(row).toBeUndefined();
  });

  it('skips when the Slack user fails the Sentry-employee gate', async function () {
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

    await syncGithubUsers();

    const row = await db('users').where('email', 'bot@sentry.io').first('*');
    expect(row).toBeUndefined();
  });
});
