import { Octokit } from '@octokit/rest';

import { GETSENTRY_ORG } from '@/config';

export async function getAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string
): Promise<Array<{ email: string | undefined; login: string | undefined }>> {
  try {
    const commitsComparison = await GETSENTRY_ORG.api.repos.compareCommits({
      owner: GETSENTRY_ORG.slug,
      repo,
      base: baseCommit ?? headCommit,
      head: headCommit,
    });
    if (
      !commitsComparison.data.commits ||
      commitsComparison.data.commits.length === 0
    ) {
      return [];
    }
    return commitsComparison.data.commits.map((commitStatus) => {
      return {
        email: commitStatus.commit.author?.email,
        login: commitStatus.author?.login,
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    // @ts-ignore
    console.error(err);
    return [];
  }
}

interface RevertAuthorInfo {
  login: string | null;
  email: string | null;
}

function extractRevertedCommitHash(commitMessage: string): string | null {
  const match = commitMessage.match(/this reverts commit ([a-f0-9]+)/i);
  return match ? match[1] : null;
}

async function getRevertCommitDetails(
  revertedHash: string,
  owner: string,
  repo: string,
  octokitInstance: Octokit
): Promise<RevertAuthorInfo | null> {
  try {
    const revertedCommitDetailsResponse = await octokitInstance.request(
      'GET /repos/{owner}/{repo}/commits/{ref}',
      {
        owner,
        repo,
        ref: revertedHash,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
    const revertedData = revertedCommitDetailsResponse.data;

    const revertedCommitAuthor = revertedData.author
      ? {
          login: revertedData.author.login,
          email: revertedData.commit.author?.email ?? null,
        }
      : null;

    return revertedCommitAuthor;
  } catch (revertError) {
    console.error(
      `  Error fetching details for reverted commit ${revertedHash}:`,
      revertError
    );
    return null;
  }
}

async function processCommit(
  commitSha: string,
  owner: string,
  repo: string,
  octokitInstance: Octokit
): Promise<RevertAuthorInfo | null> {
  try {
    const commitDetailsResponse = await octokitInstance.request(
      'GET /repos/{owner}/{repo}/commits/{ref}',
      {
        owner,
        repo,
        ref: commitSha,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
    const commitData = commitDetailsResponse.data;
    const revertedHash = extractRevertedCommitHash(commitData.commit.message);
    let revertDetails: RevertAuthorInfo | null = null;

    if (revertedHash) {
      revertDetails = await getRevertCommitDetails(
        revertedHash,
        owner,
        repo,
        octokitInstance
      );
    }

    return revertDetails;
  } catch (error) {
    console.error(`Error processing commit ${commitSha}:`, error);
    return null;
  }
}

export async function getAuthorsWithRevertedCommitAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string
): Promise<Array<{ email: string | undefined; login: string | undefined }>> {
  try {
    const commitsComparison = await GETSENTRY_ORG.api.repos.compareCommits({
      owner: GETSENTRY_ORG.slug,
      repo,
      base: baseCommit ?? headCommit,
      head: headCommit,
    });
    if (
      !commitsComparison.data.commits ||
      commitsComparison.data.commits.length === 0
    ) {
      return [];
    }

    const authors = await Promise.all(
      commitsComparison.data.commits.map(async (commitStatus) => {
        const revertInfo = await processCommit(
          commitStatus.sha,
          GETSENTRY_ORG.slug,
          repo,
          GETSENTRY_ORG.api
        );

        if (revertInfo) {
          return {
            email: revertInfo.email ?? undefined,
            login: revertInfo.login ?? undefined,
          };
        }
        return {
          email: commitStatus.commit.author?.email,
          login: commitStatus.author?.login,
        };
      })
    );
    return authors;
  } catch (err) {
    // eslint-disable-next-line no-console
    // @ts-ignore
    console.error(err);
    return [];
  }
}
