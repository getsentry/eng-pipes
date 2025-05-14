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
  const match = commitMessage.match(/This reverts commit ([a-f0-9]+)/i);
  return match ? match[1] : null;
}

async function getRevertCommitDetails(
  revertedHash: string,
  repo: string
): Promise<RevertAuthorInfo | null> {
  try {
    const revertedCommitDetailsResponse =
      await GETSENTRY_ORG.api.repos.getCommit({
        owner: GETSENTRY_ORG.slug,
        repo,
        ref: revertedHash,
      });
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
  commitMessage: string,
  repo: string
): Promise<RevertAuthorInfo | null> {
  try {
    const revertedHash = extractRevertedCommitHash(commitMessage);
    let revertDetails: RevertAuthorInfo | null = null;

    if (revertedHash) {
      revertDetails = await getRevertCommitDetails(revertedHash, repo);
    }

    return revertDetails;
  } catch (error) {
    console.error(`Error processing commit ${commitSha}:`, error);
    return null;
  }
}

async function processCommitAuthor(
  commitMetadata: any,
  repo: string
): Promise<RevertAuthorInfo> {
  const revertInfo = await processCommit(
    commitMetadata.sha,
    commitMetadata.commit.message,
    repo
  );

  if (revertInfo) {
    return {
      email: revertInfo?.email,
      login: revertInfo?.login,
    };
  }
  return {
    email: commitMetadata.commit.author?.email,
    login: commitMetadata.author?.login,
  };
}

export async function getAuthorsWithRevertedCommitAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string
): Promise<Array<RevertAuthorInfo>> {
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
      commitsComparison.data.commits.map((commitMetadata) =>
        processCommitAuthor(commitMetadata, repo)
      )
    );
    return authors.filter((author) => author !== null) as RevertAuthorInfo[];
  } catch (err) {
    // eslint-disable-next-line no-console
    // @ts-ignore
    console.error(err);
    return [];
  }
}
