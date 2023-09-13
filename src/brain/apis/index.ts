import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import getProgress from './getProgress';

export function apis() {
  bolt.event(
    'app_mention',
    wrapHandler('apis', async ({ event, say, client }) => {
      if (!event.text.includes('apis')) {
        return;
      }

      const params = event.text.trim().split("apis ")
      const team = params.length == 2 ? params[1] : '';
      const [message, ...resps] = await Promise.all([
        say({
          text: 'fetching status ...',
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'fetching status ...',
                },
              ],
            },
          ],
        }),
        getProgress(team),
      ]);

      if (resps.includes('INVALID')) {
        await client.chat.update({
            channel: String(message.channel),
            ts: String(message.ts),
            text: `Team name is not valid.`,
            blocks: [
                {
                    type: 'section',
                    text: {
                    type: 'mrkdwn',
                    text: 'Team name is not valid or does not own any APIs. Review <https://github.com/getsentry/sentry/blob/master/src/sentry/apidocs/api_ownership_stats_dont_modify.json|ownerhisp> and <https://develop.sentry.dev/api/public/#1-declaring-owner-for-the-endpoint|update on the endpoints> if needed. ',
                    },
                },
            ],
          });
      } else {
        await client.chat.update({
            channel: String(message.channel),
            ts: String(message.ts),
            text: `Done`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: String(resps),
                },
              },
            ],
          });
      }
     
    })
  );
}