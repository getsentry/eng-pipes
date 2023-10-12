import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import { SlackMessageRow } from 'knex/types/tables';

import { getTextParts } from './getTextParts';

import { bolt } from '~/api/slack';
import { BuildStatus, Color } from '~/config';
import { SlackMessage } from '~/config/slackMessage';
import { CheckRun } from '~/types';
import { updateRequiredCheck } from '~/utils/db/updateRequiredCheck';

interface ResolveFlakeyFailureParams {
  checkRun: CheckRun;
  dbCheck: SlackMessageRow<SlackMessage.REQUIRED_CHECK>;
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

  const promises: Promise<any>[] = [
    // Update original failing message state
    updateRequiredCheck({
      messageId: dbCheck.id,
      status: BuildStatus.FLAKE,
      checkRun,
    }),

    // Update original failing slack message
    // `text` is not required
    // @ts-expect-error
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
