import { bolt } from '~/src/api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '~/src/config';
import { db } from '~/src/utils/db';
import { isSentrySlackUser } from '~/src/utils/isSentrySlackUser';
import { normalizeGithubUser } from '~/src/utils/normalizeGithubUser';

/**
 * Syncs a Slack user profile change (specifically the GH profile field) to DB
 */
export function syncUserProfileChange() {
  bolt.event('user_change', async ({ event }) => {
    // Bad Slack types, we get the full User here
    // @ts-ignore
    if (!isSentrySlackUser(event.user)) {
      return;
    }

    const githubUser =
      // @ts-ignore
      event.user.profile.fields?.[SLACK_PROFILE_ID_GITHUB]?.value;

    // Only interested for githubUser
    if (!githubUser) {
      return;
    }

    // Let's save email/slack even if githubUser is undefined
    await db('users')
      .insert({
        // @ts-ignore
        email: event.user.profile.email,
        slackUser: event.user.id,
        githubUser: normalizeGithubUser(githubUser),
      })
      .onConflict(['email'])
      .merge();
  });
}
