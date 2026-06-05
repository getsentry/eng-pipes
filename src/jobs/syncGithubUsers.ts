import { normalizeGithubUser } from '@/utils/github/normalizeGithubUser';
import { isSentrySlackUser } from '@/utils/slack/isSentrySlackUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { fetchGithubUserDirectory } from '@utils/db/githubUserDirectory';

export async function syncGithubUsers() {
  const rows = await fetchGithubUserDirectory();

  for (const { email, githubUsername } of rows) {
    const login = normalizeGithubUser(githubUsername);
    if (!login) {
      continue;
    }

    const slackResult: any = await bolt.client.users.lookupByEmail({ email });
    if (
      !slackResult.ok ||
      !slackResult.user ||
      !isSentrySlackUser(slackResult.user)
    ) {
      continue;
    }

    await db('users')
      .insert({
        email,
        slackUser: slackResult.user.id,
        githubUser: login,
      })
      .onConflict('email')
      .merge();
  }
}
