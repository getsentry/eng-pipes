import { GETSENTRY_ORG } from '@/config';

export async function getAuthors(
  repo: string,
  baseCommit: string | null,
  headCommit: string
) {
  if (!baseCommit || baseCommit === headCommit) {
    try {
      const commitData = await GETSENTRY_ORG.api.repos.getCommit({
        owner: GETSENTRY_ORG.slug,
        repo,
        ref: headCommit,
      });
      // eslint-disable-next-line no-console
      console.log(commitData);
      return [
        {
          name: commitData.data.commit.author?.name,
          email: commitData.data.commit.author?.email,
          login: commitData.data.author?.login,
        },
      ];
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return [];
    }
  }
  try {
    const commitsComparison = await GETSENTRY_ORG.api.repos.compareCommits({
      owner: GETSENTRY_ORG.slug,
      repo,
      base: baseCommit,
      head: headCommit,
      per_page: 100,
    });
    // eslint-disable-next-line no-console
    console.log(commitsComparison);
    if (!commitsComparison.data.commits) {
      // eslint-disable-next-line no-console
      console.log('no commits');
      return [];
    }
    // eslint-disable-next-line no-console
    console.log(commitsComparison.data.commits);
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
