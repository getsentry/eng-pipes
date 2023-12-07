import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import getStatsMessage, {
  INVALID_TEAM_ERROR,
  OWNERSHIP_FILE_LINK,
} from './getStatsMessage';

type SlackBlock = {
  type: string;
  text: {
    type: string;
    text: string;
  };
};

export function getMessageBlocks(response, team = ''): Array<SlackBlock> {
  const blocks: Array<SlackBlock> = [];
    response.messages.forEach((message) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: team === '' ? '```' + message + '```' : message,
        },
      });
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          (response.goal === 0
            ? ':bufo-party:'
            : response.goal > 50
            ? ':bufo-cry:'
            : ':bufo-silly-goose-dance:') +
          ' ' +
          response.goal.toString() +
          '% far from the goal of having no unknown APIs.',
      },
    });
    if (response.should_show_docs === true) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Please <${response.review_link}|review> unknown and experimental APIs and <https://develop.sentry.dev/api/public/#1-declaring-owner-for-the-endpoint|update the endpoints> as either public or private.`,
        },
      });
    }
    return blocks;
}
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
        if (response.messages[0] === INVALID_TEAM_ERROR) {
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

        await client.chat.update({
          channel: String(message.channel),
          ts: String(message.ts),
          text: 'API Ownership Stats',
          blocks: getMessageBlocks(response, team),
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
