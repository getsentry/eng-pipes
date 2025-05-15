/// <reference types="jest" />

import { GETSENTRY_ORG } from '@/config';

import { getAuthors } from './getAuthors';

// Mock the GETSENTRY_ORG.api.repos.compareCommits function
jest.mock('@/config', () => ({
  GETSENTRY_ORG: {
    slug: 'sentry',
    api: {
      repos: {
        compareCommits: jest.fn(),
        getCommit: jest.fn(),
      },
      request: jest.fn(),
    },
  },
}));

describe('getAuthors', () => {
  const mockCompareCommits = GETSENTRY_ORG.api.repos
    .compareCommits as unknown as jest.Mock;
  // @ts-ignore
  beforeEach(() => {
    mockCompareCommits.mockClear();
  });

  it('should return author login and email from commits', async () => {
    const mockResponse = {
      data: {
        commits: [
          {
            commit: { author: { email: 'author1@example.com' } },
            author: { login: 'author1' },
          },
          {
            commit: { author: { email: 'author2@example.com' } },
            author: { login: 'author2' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authors = await getAuthors('my-repo', 'base-sha', 'head-sha');

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'sentry',
      repo: 'my-repo',
      base: 'base-sha',
      head: 'head-sha',
    });
    expect(authors).toEqual([
      { email: 'author1@example.com', login: 'author1' },
      { email: 'author2@example.com', login: 'author2' },
    ]);
  });

  it('should not return revert author login from revert commits when flag is set to false', async () => {
    const mockResponse = {
      data: {
        commits: [
          {
            commit: {
              author: {
                email: 'revertauthor@example.com',
              },
              message: `This reverts commit 1234567.
              Co-authored-by: originalauthor <7654321+originalauthor@users.noreply.github.com>`,
            },
            author: { login: 'revertauthor' },
          },
          {
            commit: { author: { email: 'author2@example.com' } },
            author: { login: 'author2' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authorsWithoutRevert = await getAuthors(
      'my-repo',
      'base-sha',
      'head-sha'
    );

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'sentry',
      repo: 'my-repo',
      base: 'base-sha',
      head: 'head-sha',
    });
    expect(authorsWithoutRevert).toEqual([
      { email: 'revertauthor@example.com', login: 'revertauthor' },
      { email: 'author2@example.com', login: 'author2' },
    ]);
  });

  it('should return revert author login from revert commits when flag is set to true', async () => {
    const mockResponse = {
      data: {
        commits: [
          {
            commit: {
              author: {
                email: 'revertauthor@example.com',
              },
              message: `This reverts commit 1234567.
              Co-authored-by: originalauthor <7654321+originalauthor@users.noreply.github.com>`,
            },
            author: { login: 'revertauthor' },
          },
          {
            commit: { author: { email: 'author2@example.com' } },
            author: { login: 'author2' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authorsWithRevert = await getAuthors(
      'my-repo',
      'base-sha',
      'head-sha',
      true
    );

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'sentry',
      repo: 'my-repo',
      base: 'base-sha',
      head: 'head-sha',
    });
    expect(authorsWithRevert).toEqual([
      { email: 'revertauthor@example.com', login: 'revertauthor' },
      { email: undefined, login: 'originalauthor' },
      { email: 'author2@example.com', login: 'author2' },
    ]);
  });

  it('should use headCommit as base if baseCommit is null', async () => {
    const mockResponse = {
      data: {
        commits: [
          {
            commit: { author: { email: 'author1@example.com' } },
            author: { login: 'author1' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    await getAuthors('my-repo', null, 'head-sha');

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'sentry',
      repo: 'my-repo',
      base: 'head-sha', // Expect headCommit to be used as base
      head: 'head-sha',
    });
  });

  it('should return an empty array if there are no commits', async () => {
    const mockResponse = {
      data: {
        commits: [],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authors = await getAuthors('my-repo', 'base-sha', 'head-sha');
    expect(authors).toEqual([]);
  });

  it('should return an empty array if commitsComparison.data.commits is undefined', async () => {
    const mockResponse = {
      data: {}, // No commits array
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authors = await getAuthors('my-repo', 'base-sha', 'head-sha');
    expect(authors).toEqual([]);
  });

  it('should return an empty array and log error if API call fails', async () => {
    const MOCK_ERROR = new Error('API Error');
    mockCompareCommits.mockRejectedValue(MOCK_ERROR);

    const authors = await getAuthors('my-repo', 'base-sha', 'head-sha');

    expect(authors).toEqual([]);
  });

  it('should aggregate all users when multiple commits have different authors', async () => {
    const mockResponse = {
      data: {
        commits: [
          {
            commit: { author: { email: 'user1@example.com' } },
            author: { login: 'user1' },
          },
          {
            commit: { author: { email: 'user2@example.com' } },
            author: { login: 'user2' },
          },
          {
            commit: { author: { email: 'user3@example.com' } },
            author: { login: 'user3' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockResponse);

    const authors = await getAuthors('my-repo', 'base-sha', 'head-sha');

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'sentry',
      repo: 'my-repo',
      base: 'base-sha',
      head: 'head-sha',
    });
    expect(authors).toEqual([
      { email: 'user1@example.com', login: 'user1' },
      { email: 'user2@example.com', login: 'user2' },
      { email: 'user3@example.com', login: 'user3' },
    ]);
    expect(authors.length).toBe(3);
  });
});
