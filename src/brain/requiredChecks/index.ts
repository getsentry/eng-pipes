import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { revertCommit as revertCommitBlock } from '@/blocks/revertCommit';
import {
  BuildStatus,
  Color,
  GETSENTRY_REPO,
  OWNER,
  REQUIRED_CHECK_CHANNEL,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { wrapHandler } from '@/utils/wrapHandler';
import { revertCommit } from '@api/deploySyncBot/revertCommit';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { githubEvents } from '@api/github';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { bolt } from '@api/slack';
import { getFailureMessages } from '@utils/db/getFailureMessages';
import { getSlackMessage } from '@utils/db/getSlackMessage';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { actionRevertCommit } from './actionRevertCommit';

const OK_CONCLUSIONS = [
  BuildStatus.SUCCESS,
  BuildStatus.NEUTRAL,
  BuildStatus.SKIPPED,
] as string[];

/**
 * Transform GitHub Markdown link to Slack link
 */
function githubMdToSlack(str: string) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/;
  const matches = str.match(pattern);
  if (matches) {
    return `<${matches[2]}|${matches[1]}>`;
  }

  return str;
}

function getTextParts(
  checkRun: EmitterWebhookEvent<'check_run'>['payload']['check_run']
) {
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const buildLink = `<${checkRun.html_url}|View Build>`;

  return [
    `${GETSENTRY_REPO}@master`,
    `<${commitLink}|${commitLinkText}>`,
    `is failing`,
    `(${buildLink})`,
  ];
}

async function handler({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'check_run'>) {
  // Make sure this is on `getsentry` and we are examining the aggregate "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return;
  }

  const { check_run: checkRun } = payload;

  // Check db to see if the check run at `head_sha` was already failing
  //
  // If so, and checkRun is passing, we can update the existing Slack message,
  // otherwise we can ignore as we don't need a new, spammy message
  const dbCheck = await getSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    checkRun.head_sha
  );

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // For "successful" conclusions, check if there was a previous failure, if so, update the existing slack message
  if (OK_CONCLUSIONS.includes(checkRun.conclusion || '')) {
    if (!dbCheck || dbCheck.context.status !== BuildStatus.FAILURE) {
      // If this check passes, but the sha does not match a previously failing build, then we should
      // check if we have any previous failures. If we do this means that a build was broken and
      // a new commit has fixed the broken build.
      //
      // Assume that the oldest failing build has been fixed, but the status of the builds in between should be unknown
      const failedMessages = await getFailureMessages(null);

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
                color:
                  i === originalFailureIndex ? Color.SUCCESS : Color.NEUTRAL,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text:
                        i === originalFailureIndex ? passingText : unknownText,
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
      saveSlackMessage(
        SlackMessage.REQUIRED_CHECK,
        {
          id: dbCheck.id,
        },
        {
          status: BuildStatus.FLAKE,
          passed_at: new Date(),
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

  if (dbCheck && dbCheck.context.status === BuildStatus.FAILURE) {
    return;
  }

  // This will stop double messages because of action == 'created' and 'completed' with the
  // same status/conclusion
  // Run only on `completed` action (can be `created`, and not sure what `rerequested` is)
  // This can still fire multiple times if we have additional failing checks?
  // I don't think running this once on created will work either as you can have a created w/ non-failure
  // and later it becomes failing
  if (payload.action !== 'completed') {
    console.warn(`Required check with non-completed action: ${payload.action}`);
    return;
  }

  console.log('failing', checkRun.head_sha);

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'requiredChecks.failed',
    description: 'Required check failed',
  });
  // Retrieve commit information
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  const commitBlocks = await getBlocksForCommit(relevantCommit, {
    shouldSlackMention: true,
  });

  // Otherwise, there is a failed check
  // Need to notify channel that the build has failed
  // We need to include:
  // 1) A link to the getsentry commit
  //   1a) a link to the sentry commit if possible
  // 2) The author of the failed commit (will need to lookup their slack user from their gh email)
  // 3) A list of the failed checks (job name, duration, status)
  // 4) Button to re-run job
  const jobs = checkRun.output?.text
    ?.split('\n')
    .filter((text) => text.startsWith('|'))
    .slice(2) // First 2 rows are table headers + spacer
    .map((text) => text.split('|').filter(Boolean)); // Split and filter out empty els

  const failedJobs =
    jobs?.filter(
      ([, conclusion]) =>
        !OK_CONCLUSIONS.includes(conclusion.trim().split(' ').slice(-1)[0])
    ) ?? [];

  // If all failed jobs are just missing, and the # of missing jobs represents > 50% of all jobs...
  // then ignore it. Due to GHA, it's difficult to tell if a job is actually missing vs it hasn't started yet
  // @ts-ignore
  const missingJobs = failedJobs.filter(([, conclusion]) =>
    conclusion.includes('missing')
  );

  // if (
  // missingJobs.length === failedJobs.length &&
  // missingJobs.length >= (jobs?.length ?? 0) / 2
  // ) {
  // Sentry.withScope((scope) => {
  // scope.setContext('Check Run', {
  // id: checkRun.id,
  // url: checkRun.html_url,
  // sha: checkRun.head_sha,
  // });
  // scope.setContext('Required Checks - Missing Jobs', {
  // missingJobs,
  // });
  // Sentry.startTransaction({
  // op: 'debug',
  // name: 'requiredChecks.missing',
  // }).finish();
  // });
  // return;
  // }

  const text = getTextParts(checkRun).join(' ');
  const jobsList = jobs
    ?.map(
      ([jobName, conclusion]) => `${githubMdToSlack(jobName)} - ${conclusion}`
    )
    .join('\n');

  // Check if getsentry is already in a failing state, if it is then do not ping `REQUIRED_CHECK_CHANNEL` until
  // we are green again. This can happen when either 1) getsentry is actually broken or 2) flakey tests
  const [existingFailureMessage] = await getFailureMessages();

  const newFailureMessage =
    !existingFailureMessage &&
    (await bolt.client.chat.postMessage({
      channel: REQUIRED_CHECK_CHANNEL,
      text,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            ...commitBlocks,
            ...(relevantCommit || true
              ? [
                  {
                    type: 'actions',
                    // @ts-ignore
                    elements: [
                      revertCommitBlock({
                        sha: relevantCommit?.sha || checkRun.head_sha,
                        repo:
                          relevantCommit?.sha === checkRun.head_sha
                            ? 'getsentry'
                            : 'sentry',
                      }),
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    }));

  console.log(newFailureMessage, {
    blocks: [
      ...commitBlocks,
      ...(relevantCommit
        ? [
            revertCommitBlock({
              sha: relevantCommit.sha,
              repo:
                relevantCommit.sha === checkRun.head_sha
                  ? 'getsentry'
                  : 'sentry',
            }),
          ]
        : []),
    ],
  });

  // Only thread jobs list statuses for new failures
  if (newFailureMessage) {
    // Add thread for jobs list
    await bolt.client.chat.postMessage({
      channel: `${newFailureMessage.channel}`,
      thread_ts: `${newFailureMessage.ts}`,
      text: `Here are the job statuses

${jobsList}`,
    });
  }
  // Thread the current failure to existing failure message
  const followupFailureMessage =
    existingFailureMessage &&
    (await bolt.client.chat.postMessage({
      channel: `${existingFailureMessage.channel}`,
      thread_ts: `${existingFailureMessage.ts}`,
      text,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `This *may* be failing only due to a previous commit`,
              },
            },
            ...commitBlocks,
          ],
        },
      ],
    }));

  // ts bugging out but one of these has to exist and not be falsey
  const postedMessage = (newFailureMessage ||
    followupFailureMessage) as Exclude<
    typeof followupFailureMessage,
    false | undefined
  >;

  // Save failing required check run to db
  await saveSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    {
      refId: checkRun.head_sha,
      channel: `${postedMessage.channel}`,
      ts: `${postedMessage.ts}`,
    },
    {
      // Always record the status as failing, even though commits following a broken build is not known since it could be
      // failing of its own accord, or due to a previous commit
      status: BuildStatus.FAILURE,
      failed_at: new Date(),
    }
  );

  tx.finish();
}

export async function requiredChecks() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);

  bolt.action(
    /revert-commit/,
    wrapHandler('actionRevertCommit', actionRevertCommit)
  );

  bolt.view('revert-commit-confirm', async ({ ack, body, view, client }) => {
    await ack();
    console.log(view);
    try {
      const data = JSON.parse(view.private_metadata);
      await revertCommit(data);
    } catch (err) {
      Sentry.captureException(err);
    }
  });
}
