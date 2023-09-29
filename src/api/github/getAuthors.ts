import { GETSENTRY_ORG } from '@/config';
import { filterNulls } from '@/utils/arrays';
import { getUser } from '../getUser';

export async function getCommitterSlackUsers(
  repo: string,
  baseCommit: string | null,
  headCommit: string
): Promise<Array<string>> {
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
    const authors = commitsComparison.data.commits.map((commitStatus) => {
      return {
        email: commitStatus.commit.author?.email,
        login: commitStatus.author?.login,
      };
    });

    // If there are no authors, we can't cc anyone
    if (authors.length === 0) return [];

    // Get all users who have a slack account
    const allUserAccounts = await Promise.all(
      authors.map((author) =>
        getUser({ email: author.email, githubUser: author.login })
      )
    );
    const users = filterNulls(allUserAccounts).filter(u => u.slackUser != null);
    const slackUsernames = new Set<string>(users.map(u => u.slackUser));
    return Array.from(slackUsernames);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return [];
  }
}
