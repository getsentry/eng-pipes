const mockQuery = jest.fn();

jest.mock('@notionhq/client', () => ({
  Client: function () {
    return { databases: { query: mockQuery } };
  },
}));

import { fetchGithubUserDirectory } from './githubUserDirectory';

function richText(plain: string) {
  return [{ plain_text: plain }];
}

describe('fetchGithubUserDirectory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns email + githubUsername for well-formed pages', async () => {
    mockQuery.mockResolvedValueOnce({
      has_more: false,
      next_cursor: null,
      results: [
        {
          properties: {
            Email: { title: richText('alice@sentry.io') },
            'GitHub Username': { rich_text: richText('alice-gh') },
          },
        },
        {
          properties: {
            Email: { title: richText('bob@sentry.io') },
            'GitHub Username': { rich_text: richText('bob-gh') },
          },
        },
      ],
    });

    const rows = await fetchGithubUserDirectory();

    expect(rows).toEqual([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
      { email: 'bob@sentry.io', githubUsername: 'bob-gh' },
    ]);
  });

  it('drops pages missing email or github username', async () => {
    mockQuery.mockResolvedValueOnce({
      has_more: false,
      next_cursor: null,
      results: [
        {
          properties: {
            Email: { title: richText('alice@sentry.io') },
            'GitHub Username': { rich_text: richText('alice-gh') },
          },
        },
        {
          properties: {
            Email: { title: [] },
            'GitHub Username': { rich_text: richText('orphan-gh') },
          },
        },
        {
          properties: {
            Email: { title: richText('noLogin@sentry.io') },
            'GitHub Username': { rich_text: [] },
          },
        },
      ],
    });

    const rows = await fetchGithubUserDirectory();

    expect(rows).toEqual([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
    ]);
  });

  it('paginates until has_more is false', async () => {
    mockQuery
      .mockResolvedValueOnce({
        has_more: true,
        next_cursor: 'cursor-1',
        results: [
          {
            properties: {
              Email: { title: richText('alice@sentry.io') },
              'GitHub Username': { rich_text: richText('alice-gh') },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        has_more: false,
        next_cursor: null,
        results: [
          {
            properties: {
              Email: { title: richText('bob@sentry.io') },
              'GitHub Username': { rich_text: richText('bob-gh') },
            },
          },
        ],
      });

    const rows = await fetchGithubUserDirectory();

    expect(rows).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0][0]).toMatchObject({
      start_cursor: undefined,
    });
    expect(mockQuery.mock.calls[1][0]).toMatchObject({
      start_cursor: 'cursor-1',
    });
  });

  it('joins multi-span rich text into a single string', async () => {
    mockQuery.mockResolvedValueOnce({
      has_more: false,
      next_cursor: null,
      results: [
        {
          properties: {
            Email: {
              title: [{ plain_text: 'alice' }, { plain_text: '@sentry.io' }],
            },
            'GitHub Username': {
              rich_text: [{ plain_text: 'alice' }, { plain_text: '-gh' }],
            },
          },
        },
      ],
    });

    const rows = await fetchGithubUserDirectory();

    expect(rows).toEqual([
      { email: 'alice@sentry.io', githubUsername: 'alice-gh' },
    ]);
  });
});
