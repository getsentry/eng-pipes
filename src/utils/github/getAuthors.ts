import { GETSENTRY_ORG } from '@/config';

function extractOriginalAuthor(message: string): {
  email: undefined;
  login: string | undefined;
} {
  try {
    const originalAuthorMatch = message.match(/Co-authored-by: (\w+) <[^>]+>/);
    return {
      email: undefined,
      login: originalAuthorMatch ? originalAuthorMatch[1] : undefined,
    };
  } catch (error) {
    console.error('Failed to extract original author:', error);
    return {
      email: undefined,
      login: undefined,
    };
  }
}

export async function getAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string,
  includeRevertedCommits: boolean = false
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
    return commitsComparison.data.commits.flatMap((commitStatus) => {
      const authors = [
        {
          email: commitStatus.commit.author?.email,
          login: commitStatus.author?.login,
        },
      ];
      if (includeRevertedCommits) {
        const originalAuthor = extractOriginalAuthor(
          commitStatus.commit.message
        );

        if (originalAuthor.login) {
          authors.push(originalAuthor);
        }
      }
      return authors;
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    // @ts-ignore
    console.error(err);
    return [];
  }
}
