import { bolt } from '@api/slack';
import { setUserPreference } from '@utils/db/setUserPreference';

export function notificationPreferences() {
  bolt.message(
    /^deploy notifications (on|off).*/,
    async ({ payload, context, client }) => {
      // @ts-ignore;
      const slackUser = payload.user;
      const pref = context.matches[1];

      const result = await setUserPreference(
        {
          slackUser,
        },
        { disableSlackNotifications: pref === 'off' }
      );

      const text = result
        ? `Deploy notifications: *${pref}*`
        : 'There was an error changing your deploy notification preferences';

      await client.chat.postEphemeral({
        channel: payload.channel,
        // @ts-ignore
        user: payload.user,
        text,
      });
    }
  );
}
