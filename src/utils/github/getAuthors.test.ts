/// <reference types="jest" />

import { GETSENTRY_ORG } from '@/config';

import { getAuthors, getAuthorsWithRevertedCommitAuthors } from './getAuthors';

// Mock the GETSENTRY_ORG.api.repos.compareCommits function
jest.mock('@/config', () => ({
  GETSENTRY_ORG: {
    slug: 'sentry',
    api: {
      repos: {
        compareCommits: jest.fn(),
      },
      request: jest.fn(),
    },
  },
}));

describe('getAuthors', () => {
  const mockCompareCommits = GETSENTRY_ORG.api.repos
    .compareCommits as unknown as jest.Mock;
  // @ts-ignore
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  beforeEach(() => {
    // Clear mock history before each test
    mockCompareCommits.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
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
    expect(consoleErrorSpy).toHaveBeenCalledWith(MOCK_ERROR);
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

describe('getAuthorsWithRevertedCommitAuthors', () => {
  const mockCompareCommits = GETSENTRY_ORG.api.repos
    .compareCommits as unknown as jest.Mock;
  const mockOctokitRequest = GETSENTRY_ORG.api.request as unknown as jest.Mock;
  // @ts-ignore
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  beforeEach(() => {
    mockCompareCommits.mockClear();
    mockOctokitRequest.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should return authors for standard commits (no reverts)', async () => {
    const mockApiResponse = {
      data: {
        commits: [
          {
            sha: 'sha1',
            commit: { author: { email: 'author1@example.com' } },
            author: { login: 'author1' },
          },
          {
            sha: 'sha2',
            commit: { author: { email: 'author2@example.com' } },
            author: { login: 'author2' },
          },
        ],
      },
    };
    mockCompareCommits.mockResolvedValue(mockApiResponse);
    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (url === 'GET /repos/{owner}/{repo}/commits/{ref}') {
        if (params.ref === 'sha1')
          return {
            data: {
              sha: 'sha1',
              commit: { message: 'feat: regular commit' },
              author: { login: 'author1' },
            },
          };
        if (params.ref === 'sha2')
          return {
            data: {
              sha: 'sha2',
              commit: { message: 'fix: another regular commit' },
              author: { login: 'author2' },
            },
          };
      }
      throw new Error(
        `Unexpected Octokit request: ${url} with params ${JSON.stringify(
          params
        )}`
      );
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: 'author1@example.com', login: 'author1' },
      { email: 'author2@example.com', login: 'author2' },
    ]);
    expect(mockOctokitRequest).toHaveBeenCalledTimes(2);
  });

  it('should return original author for a revert commit if found', async () => {
    const REVERTED_COMMIT_SHA = 'revertedsha123';
    const REVERT_COMMIT_SHA = 'revertcommisha456';

    mockCompareCommits.mockResolvedValue({
      data: {
        commits: [
          {
            sha: REVERT_COMMIT_SHA,
            commit: { author: { email: 'reverter@example.com' } },
            author: { login: 'reverter_user' },
          },
        ],
      },
    });

    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (url === 'GET /repos/{owner}/{repo}/commits/{ref}') {
        if (params.ref === REVERT_COMMIT_SHA) {
          return {
            data: {
              sha: REVERT_COMMIT_SHA,
              commit: {
                message: `Revert "feat: some feature"\n\nThis reverts commit ${REVERTED_COMMIT_SHA}.`,
              },
              author: { login: 'reverter_user' },
            },
          };
        }
        if (params.ref === REVERTED_COMMIT_SHA) {
          return {
            data: {
              sha: REVERTED_COMMIT_SHA,
              commit: { author: { email: 'original_author@example.com' } },
              author: { login: 'original_user' },
            },
          };
        }
      }
      throw new Error(`Unexpected Octokit request to ${url}`);
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: 'original_author@example.com', login: 'original_user' },
    ]);
    expect(mockOctokitRequest).toHaveBeenCalledTimes(2);
  });

  it('should fallback to reverter if original reverted commit details fail to fetch', async () => {
    const REVERTED_COMMIT_SHA = 'revertedsha456';
    const REVERT_COMMIT_SHA = 'revertcommisha789';

    mockCompareCommits.mockResolvedValue({
      data: {
        commits: [
          {
            sha: REVERT_COMMIT_SHA,
            commit: { author: { email: 'reverter@sentry.io' } },
            author: { login: 'reverter_user' },
          },
        ],
      },
    });

    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (url === 'GET /repos/{owner}/{repo}/commits/{ref}') {
        if (params.ref === REVERT_COMMIT_SHA)
          return {
            data: {
              sha: REVERT_COMMIT_SHA,
              commit: {
                message: `This reverts commit ${REVERTED_COMMIT_SHA}.`,
              },
              author: { login: 'reverter_user' },
            },
          };
        if (params.ref === REVERTED_COMMIT_SHA) {
          throw new Error('Failed to fetch original commit');
        }
      }
      throw new Error(`Unexpected Octokit request to ${url}`);
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: 'reverter@sentry.io', login: 'reverter_user' },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `  Error fetching details for reverted commit ${REVERTED_COMMIT_SHA}:`,
      expect.any(Error)
    );
  });

  it('should handle a mix of standard and revert commits', async () => {
    const STANDARD_SHA = 'standardsha';
    const REVERTED_SHA = 'revertedoriginalsha';
    const REVERT_SHA = 'revertingsha';

    mockCompareCommits.mockResolvedValue({
      data: {
        commits: [
          {
            sha: STANDARD_SHA,
            commit: { author: { email: 'std@example.com' } },
            author: { login: 'std_user' },
          },
          {
            sha: REVERT_SHA,
            commit: { author: { email: 'reverter@example.com' } },
            author: { login: 'reverter_user' },
          },
        ],
      },
    });

    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (url === 'GET /repos/{owner}/{repo}/commits/{ref}') {
        if (params.ref === STANDARD_SHA)
          return {
            data: {
              sha: STANDARD_SHA,
              commit: { message: 'feat: standard work' },
            },
          };
        if (params.ref === REVERT_SHA)
          return {
            data: {
              sha: REVERT_SHA,
              commit: { message: `This reverts commit ${REVERTED_SHA}.` },
            },
          };
        if (params.ref === REVERTED_SHA)
          return {
            data: {
              sha: REVERTED_SHA,
              commit: { author: { email: 'original@example.com' } },
              author: { login: 'original_user' },
            },
          };
      }
      throw new Error(`Unexpected Octokit request to ${url}`);
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: 'std@example.com', login: 'std_user' },
      { email: 'original@example.com', login: 'original_user' },
    ]);
  });

  it('should return empty array if compareCommits API fails', async () => {
    mockCompareCommits.mockRejectedValue(new Error('Compare API failed'));
    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should return empty array if compareCommits returns no commits', async () => {
    mockCompareCommits.mockResolvedValue({ data: { commits: [] } });
    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([]);
  });

  it('should fallback to commitStatus author if processCommit fails for non-revert specific reason', async () => {
    mockCompareCommits.mockResolvedValue({
      data: {
        commits: [
          {
            sha: 'errorSha',
            commit: { author: { email: 'commitstatus@example.com' } },
            author: { login: 'commitstatus_user' },
          },
        ],
      },
    });
    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (
        url === 'GET /repos/{owner}/{repo}/commits/{ref}' &&
        params.ref === 'errorSha'
      ) {
        throw new Error('Failed to fetch commit details for errorSha');
      }
      throw new Error(`Unexpected Octokit request to ${url}`);
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: 'commitstatus@example.com', login: 'commitstatus_user' },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error processing commit errorSha:',
      expect.any(Error)
    );
  });

  it('should handle missing email or login for original author of a revert commit', async () => {
    const REVERTED_COMMIT_SHA = 'revertedsha_partial';
    const REVERT_COMMIT_SHA = 'revertcommisha_partial';

    mockCompareCommits.mockResolvedValue({
      data: {
        commits: [
          {
            sha: REVERT_COMMIT_SHA,
            commit: { author: { email: 'reverter@example.com' } },
            author: { login: 'reverter_user' },
          },
        ],
      },
    });

    mockOctokitRequest.mockImplementation(async (url: string, params: any) => {
      if (url === 'GET /repos/{owner}/{repo}/commits/{ref}') {
        if (params.ref === REVERT_COMMIT_SHA)
          return {
            data: {
              sha: REVERT_COMMIT_SHA,
              commit: {
                message: `This reverts commit ${REVERTED_COMMIT_SHA}.`,
              },
            },
          };
        if (params.ref === REVERTED_COMMIT_SHA)
          return {
            data: {
              sha: REVERTED_COMMIT_SHA,
              commit: { author: { name: 'Original Name' } }, // email missing
              author: { login: 'original_user_no_email' },
            },
          };
      }
      throw new Error(`Unexpected Octokit request to ${url}`);
    });

    const authors = await getAuthorsWithRevertedCommitAuthors(
      'my-repo',
      'base',
      'head'
    );
    expect(authors).toEqual([
      { email: undefined, login: 'original_user_no_email' },
    ]);
  });
});
