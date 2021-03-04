import { SLACK_PROFILE_ID_GITHUB } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { isSentrySlackUser } from '@utils/isSentrySlackUser';

export function syncSlackUsers() {
  bolt.event('app_mention', async ({ event, say, client }) => {
    if (!event.text.includes('sync slack users')) {
      return;
    }

    let total = 0;

    const msgPromise = say(':sentry-loading: Syncing Slack users...');

    async function processUsers(cursor?: string) {
      const results = await client.users.list({ cursor, limit: 10 });

      // @ts-ignore
      for (const member of results.members) {
        if (!isSentrySlackUser(member)) {
          continue;
        }

        const profile = await client.users.profile.get({
          user: member.id,
        });

        // @ts-ignore
        const githubLogin = profile?.profile.fields?.[
          SLACK_PROFILE_ID_GITHUB
        ]?.value.replace(/(https:\/\/|)github.com\//, '');

        const exists = await db('users')
          .where({
            email: member.profile?.email,
            slackUser: member.id,
          })
          .first('*');

        // If user doesn't already exist *OR* they do not have a github user set, update db
        if (!exists || (!exists.githubUser && githubLogin)) {
          total++;
          await db('users')
            .insert({
              email: member.profile?.email,
              slackUser: member.id,
              githubUser: githubLogin,
            })
            .onConflict(['email'])
            .merge();
        }
      }

      if (results.response_metadata?.next_cursor) {
        await processUsers(results.response_metadata?.next_cursor);
      } else {
        return;
      }
    }
    await processUsers();

    const msg = await msgPromise;

    await client.chat.update({
      ts: `${msg.ts}`,
      channel: `${msg.channel}`,
      text: `Updated ${total} users`,
    });
  });
}
