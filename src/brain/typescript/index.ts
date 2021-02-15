import { bolt } from '@api/slack';

import getProgress from './getProgress';

export function typescript() {
  bolt.event('app_mention', async ({ event, say, client }) => {
    if (!event.text.includes('typescript')) {
      return;
    }

    const [message, sentryResp, getsentryResp] = await Promise.all([
      say({
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
      getProgress({}),
      getProgress({
        repo: 'getsentry',
        basePath: 'static/getsentry',
        appDir: 'gsApp',
      }),
    ]);

    const progress = (sentryResp.progress + getsentryResp.progress) / 2;
    const remainingFiles =
      sentryResp.remainingFiles + getsentryResp.remainingFiles;

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
            text: `• *sentry:* ${sentryResp.remainingFiles} files remain (${sentryResp.progress}%)
• *getsentry:* ${getsentryResp.remainingFiles} files remain (${getsentryResp.progress}%)`,
          },
        },
      ],
    });
  });
}
