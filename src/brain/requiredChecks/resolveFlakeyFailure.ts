import * as Sentry from '@sentry/node';
import { SlackMessageRow } from 'knex/types/tables';

import { BuildStatus, Color } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { CheckRun } from '@/types';
import { bolt } from '@api/slack';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { getTextParts } from './getTextParts';

interface ResolveFlakeyFailureParams {
  checkRun: CheckRun;
  dbCheck: SlackMessageRow;
}

/**
 * This is called when a build succeeds *and* the commit was previously marked
 * as failing.
 *
 * This should update the previous failure message on Slack to reflect the new
 * passing state.
 */
export async function resolveFlakeyFailure({
  checkRun,
  dbCheck,
}: ResolveFlakeyFailureParams) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.fixed',
  });

  // Update original failing slack message
  const textParts = getTextParts(checkRun);
  textParts.splice(2, 1, 'is ~failing~ passing!');
  const updatedText = textParts.join(' ');

  const updatedTimestamp = new Date(checkRun.completed_at ?? '');
  const promises: Promise<any>[] = [
    // Update original failing message state
    saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      {
        id: dbCheck.id,
      },
      {
        status: BuildStatus.FLAKE,
        passed_at: updatedTimestamp,
        updated_at: updatedTimestamp,
      }
    ),
    // Update original failing slack message
    // `text` is not required
    // @ts-ignore
    bolt.client.chat.update({
      channel: dbCheck.channel,
      ts: dbCheck.ts,
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: updatedText,
              },
            },
          ],
        },
      ],
    }),
  ];

  await Promise.all(promises);

  Sentry.withScope((scope) => {
    scope.setContext('Check Run', {
      id: checkRun.id,
      url: checkRun.html_url,
      sha: checkRun.head_sha,
    });
    tx.finish();
  });

  return;
}
