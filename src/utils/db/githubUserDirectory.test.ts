const mockQuery = jest.fn();

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function () {
    return { query: mockQuery };
  },
}));

import { fetchGithubUserDirectory } from './githubUserDirectory';

describe('fetchGithubUserDirectory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns email + githubUsername for well-formed rows', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        { email: 'alice@sentry.io', github_username: 'alice-gh' },
        { email: 'bob@sentry.io', github_username: 'bob-gh' },
      ],
    ]);

    const rows = await fetchGithubUserDirectory();

    expect(rows).toEqual([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
      { email: 'bob@sentry.io', githubUsername: 'bob-gh' },
    ]);
  });

  it('drops rows missing email or github_username', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        { email: 'alice@sentry.io', github_username: 'alice-gh' },
        { email: null, github_username: 'orphan-gh' },
        { email: 'noLogin@sentry.io', github_username: null },
        { email: 'empty@sentry.io', github_username: '' },
      ],
    ]);

    const rows = await fetchGithubUserDirectory();

    expect(rows).toEqual([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
    ]);
  });
});
