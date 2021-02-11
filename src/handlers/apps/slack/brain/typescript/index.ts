import { slackEvents, web } from '@api/slack';
import getProgress from '@app/handlers/apps/slack/getProgress';

export function typescript() {
  slackEvents.on('app_mention', async (event) => {
    if (!event.text.includes('typescript')) {
      return;
    }

    const [message, sentryResp, getsentryResp] = await Promise.all([
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

    await web.chat.update({
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
