import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import getProgress, { OWNERSHIP_FILE_LINK } from './getProgress';

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

      if (resps[0].message === 'INVALID_TEAM') {
        await client.chat.update({
            channel: String(message.channel),
            ts: String(message.ts),
            text: `Team name is not valid.`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Team name is not valid or does not own any APIs. Review <${OWNERSHIP_FILE_LINK}|ownerhisp> and <https://develop.sentry.dev/api/public/#1-declaring-owner-for-the-endpoint|update on the endpoints> if needed. `,
                    },
                },
            ],
          });
      } else {
        if (resps[0])
        await client.chat.update({
            channel: String(message.channel),
            ts: String(message.ts),
            text: `Done`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: String(resps[0].message),
                },
              },
              resps[0].should_show_docs === true ? {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `Please <${resps[0].review_link}|review> unowned and experimental APIs and  <https://develop.sentry.dev/api/public/#1-declaring-owner-for-the-endpoint|update the endpoints> as either public or private.`,
                },
              }: null,
            ],
          });
      }
    })
  );
}