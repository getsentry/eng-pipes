import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import getProgress from './getProgress';

export function reactTestingLibrary() {
  bolt.event(
    'app_mention',
    wrapHandler('rtl', async ({ event, say, client }) => {
      if (!event.text.includes('rtl')) {
        return;
      }

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

      const { remainingFiles, progress } = await getProgress();

      await client.chat.update({
        channel: String(message.channel),
        ts: String(message.ts),
        text: `RTL progress: ${progress}% completed, ${remainingFiles} files remaining`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:rtl: progress: *${progress}%* completed, *${remainingFiles}* files remaining`,
            },
          },
        ],
      });
    })
  );
}
