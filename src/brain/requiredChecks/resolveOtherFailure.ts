import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { BuildStatus, Color } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { bolt } from '@api/slack';
import { getFailureMessages } from '@utils/db/getFailureMessages';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { getTextParts } from './getTextParts';

interface ResolveOtherFailureParams {
  checkRun: EmitterWebhookEvent<'check_run'>['payload']['check_run'];
}
/**
 * This is called when our build passes *and* builds and currently
 * in a broken state.
 */
export async function resolveOtherFailure({
  checkRun,
}: ResolveOtherFailureParams) {
  // If this check passes, but the sha does not match a previously failing build, then we should
  // check if we have any previous failures. If we do this means that a build was broken and
  // a new commit has fixed the broken build.
  //
  // Assume that the oldest failing build has been fixed, but the status of the builds in between should be unknown
  const failedMessages = await getFailureMessages(null, checkRun.head_sha);

  if (!failedMessages.length) {
    // Nothing to do, just a normal test passing
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.recovery',
  });

  const textParts = getTextParts(checkRun);

  const updatedParts = [...textParts];
  updatedParts.splice(2, 1, 'is ~failing~ now fixed!');
  const passingText = updatedParts.join(' ');

  const unknownParts = [...textParts];
  unknownParts.splice(
    2,
    1,
    'is ~failing~ unknown due to a previously broken build.'
  );
  const unknownText = unknownParts.join(' ');

  const newPassingParts = [...textParts];
  newPassingParts.splice(2, 1, 'is now passing again');
  const newPassingText = newPassingParts.join(' ');

  const originalFailureIndex = failedMessages.length - 1;
  const promises: Promise<any>[] = [
    // Update any failed builds since the original failing build.
    // Note we update these to "unknown" as we don't know if they would have passed or not
    ...failedMessages.flatMap(async (message, i) => [
      saveSlackMessage(
        SlackMessage.REQUIRED_CHECK,
        {
          id: message.id,
        },
        {
          status:
            i === originalFailureIndex
              ? BuildStatus.FIXED
              : BuildStatus.UNKNOWN,
          updated_at: new Date(),
        }
      ),

      // Text is optional
      // @ts-ignore
      bolt.client.chat.update({
        channel: message.channel,
        ts: message.ts,
        attachments: [
          {
            color: i === originalFailureIndex ? Color.SUCCESS : Color.NEUTRAL,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: i === originalFailureIndex ? passingText : unknownText,
                },
              },
            ],
          },
        ],
      }),
    ]),

    // Notify thread that builds are now passing again
    // @ts-ignore
    bolt.client.chat.postMessage({
      channel: failedMessages[originalFailureIndex].channel,
      thread_ts: failedMessages[originalFailureIndex].ts,
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: newPassingText,
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

    scope.setContext('Required Check Fixed', {
      unknownStatuses: failedMessages
        .map((message) => message.refId)
        .join(', '),
    });

    tx.finish();
  });

  return;
}
