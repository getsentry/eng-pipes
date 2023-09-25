import { GETSENTRY_ORG } from '@/config';

export async function getAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string
) {
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
        name: commitStatus.commit.author?.name,
        email: commitStatus.commit.author?.email,
        login: commitStatus.author?.login,
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return [];
  }
}
