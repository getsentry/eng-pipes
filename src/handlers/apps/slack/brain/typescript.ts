import { web, slackEvents } from '../../../../api/slack';

import getProgress from '../getProgress';

export function typescript() {
  slackEvents.on('app_mention', async (event) => {
    if (event.text.includes('typescript')) {
      const [message, progressResp] = await Promise.all([
        web.chat.postMessage({
          channel: event.channel,
          text: '⏱  fetching status ...',
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '⏱  fetching status ...',
                },
              ],
            },
          ],
        }),
        getProgress(),
      ]);

      const { progress, remainingFiles } = progressResp;
      await web.chat.update({
        channel: String(message.channel),
        ts: String(message.ts),
        text: `TypeScript progress: ${progress}% completed, ${remainingFiles} files remaining`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `TypeScript progress: *${progress}%* completed, *${remainingFiles}* files remaining`,
            },
          },
        ],
      });
    }
  });
}
