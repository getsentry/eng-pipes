import { SLACK_PROFILE_ID_GITHUB } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { normalizeGithubUser } from '@utils/normalizeGithubUser';

/**
 * Syncs a Slack user profile change (specifically the GH profile field) to DB
 */
export function syncUserProfileChange() {
  bolt.event('user_change', async ({ event }) => {
    console.log(event);

    // Bad Slack types, we get the full User here
    // @ts-ignore
    if (!event.user.is_email_confirmed || event.user.deleted) {
      return;
    }

    // @ts-ignore
    if (!event.user.profile.email.endsWith('@sentry.io')) {
      return;
    }

    const { profile } = await bolt.client.users.profile.get({
      user: event.user.id,
    });

    const githubUser = normalizeGithubUser(
      // @ts-ignore
      profile?.fields?.[SLACK_PROFILE_ID_GITHUB]?.value
    );

    console.log(profile);

    // Let's save email/slack even if githubUser is undefined
    await db('users')
      .insert({
        // @ts-ignore
        email: profile.email,
        slackUser: event.user.id,
        githubUser,
      })
      .onConflict(['email'])
      .merge();
  });
}
