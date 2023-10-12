import getStatsMessage, {
  INVALID_TEAM_ERROR,
  OWNERSHIP_FILE_LINK,
} from './getStatsMessage';

import { bolt } from '~/src/api/slack';
import { wrapHandler } from '~/src/utils/wrapHandler';

export function apis() {
  bolt.event(
    'app_mention',
    wrapHandler('apis', async ({ event, say, client }) => {
      if (!event.text.includes('apis')) {
        return;
      }

      const params = event.text.trim().split('apis ');
      const team = params.length === 2 ? params[1] : '';
      const message = await say({
        text: ':sentry-loading: fetching status ...',
        blocks: [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: ':sentry-loading: fetching status ...',
              },
            ],
          },
        ],
      });

      try {
        const response = await getStatsMessage(team);
        if (response.message === INVALID_TEAM_ERROR) {
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
          return;
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                team === ''
                  ? '```' + response.message + '```'
                  : response.message,
            },
          },
        ];

        if (response.should_show_docs === true) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Please <${response.review_link}|review> unknown and experimental APIs and <https://develop.sentry.dev/api/public/#1-declaring-owner-for-the-endpoint|update the endpoints> as either public or private.`,
            },
          });
        }

        await client.chat.update({
          channel: String(message.channel),
          ts: String(message.ts),
          text: 'API Ownership Stats',
          blocks,
        });
      } catch (ex) {
        await client.chat.update({
          channel: String(message.channel),
          ts: String(message.ts),
          text: ':fire_elmo: Something went wrong. Please try again and ping #discuss-apis if the issue persists.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':fire_elmo: Something went wrong. Please try again and ping #discuss-apis if the issue persists.',
              },
            },
          ],
        });
      }
    })
  );
}
