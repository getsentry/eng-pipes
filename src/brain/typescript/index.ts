import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import getProgress from './getProgress';

export function typescript() {
  bolt.event(
    'app_mention',
    wrapHandler('typescript', async ({ event, say, client }) => {
      if (!event.text.includes('typescript')) {
        return;
      }

      const [message, ...resps] = await Promise.all([
        say({
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
        }),
        getProgress({}),
        getProgress({
          repo: 'getsentry',
          basePath: 'static/getsentry',
          appDir: 'gsApp',
        }),
        getProgress({
          repo: 'getsentry',
          basePath: 'static/getsentry',
          appDir: 'gsAdmin',
        }),
      ]);

      const remainingFiles = resps.reduce(
        (acc, { remainingFiles }) => acc + remainingFiles,
        0
      );
      const totalFiles = resps.reduce((acc, { total }) => acc + total, 0);
      const progress =
        Math.round(((totalFiles - remainingFiles) / totalFiles) * 10000) / 100;

      await client.chat.update({
        channel: String(message.channel),
        ts: String(message.ts),
        text: `TypeScript progress: ${progress}% completed, ${remainingFiles} files remaining`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:typescript: progress: *${progress}%* completed, *${remainingFiles}* files remaining`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `• *sentry:* ${resps[0].remainingFiles} files remain (${resps[0].progress}%)
• *getsentry app:* ${resps[1].remainingFiles} files remain (${resps[1].progress}%)
• *getsentry admin:* ${resps[2].remainingFiles} files remain (${resps[2].progress}%)`,
            },
          },
        ],
      });
    })
  );
}
