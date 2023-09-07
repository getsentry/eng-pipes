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
        getProgress(),
      ]);

      console.log(resps);

      await client.chat.update({
        channel: String(message.channel),
        ts: String(message.ts),
        text: `Done`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Section 1`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Section 2`,
            },
          },
        ],
      });
    })
  );
}
