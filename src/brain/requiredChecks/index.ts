import { EmitterWebhookEvent } from '@octokit/webhooks';

import { Color, GETSENTRY_REPO, OWNER, REQUIRED_CHECK_CHANNEL } from '@/config';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { githubEvents } from '@api/github';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { bolt } from '@api/slack';
import { getRequiredCheck } from '@utils/db/getRequiredCheck';
import { saveRequiredCheck } from '@utils/db/saveRequiredCheck';

const OK_CONCLUSIONS = ['success', 'neutral', 'skipped'];

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
  const dbCheck = await getRequiredCheck(checkRun.head_sha);

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // For "successful" conclusions, check if there was a previous failure, if so, update the existing slack message
  if (OK_CONCLUSIONS.includes(checkRun.conclusion || '')) {
    if (!dbCheck || dbCheck.status !== 'failure') {
      return;
    }
    // Update slack message
    await saveRequiredCheck({
      ref: checkRun.head_sha,
      status: 'success',
    });

    const textParts = getTextParts(checkRun);
    textParts.splice(2, 1, 'is ~failing~ passing!');
    const updatedText = textParts.join(' ');

    // Text is not required?
    // @ts-ignore
    await bolt.client.chat.update({
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
    });

    return;
  }

  if (dbCheck && dbCheck.status === 'failure') {
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

  console.log(
    `Received failed check run ${checkRun.id} (${id}) for commit ${checkRun.head_sha}`
  );

  // Retrieve commit information
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  const commitBlocks = getBlocksForCommit(relevantCommit);

  // Otherwise, there is a failed check
  // Need to notify channel that the build has failed
  // We need to include:
  // 1) A link to the getsentry commit
  //   1a) a link to the sentry commit if possible
  // 2) The author of the failed commit (will need to lookup their slack user from their gh email)
  // 3) A list of the failed checks (job name, duration, status)
  // 4) Button to re-run job
  const failedJobs = checkRun.output?.text
    ?.split('\n')
    .filter((text) => text.startsWith('|'))
    .slice(2) // First 2 rows are table headers + spacer
    .map((text) => text.split('|').filter(Boolean)) // Split and filter out empty els
    .filter(([, conclusion]) => !OK_CONCLUSIONS.includes(conclusion));

  const text = getTextParts(checkRun).join(' ');
  const jobsList = failedJobs
    ?.map(
      ([jobName, conclusion]) => `${githubMdToSlack(jobName)} - ${conclusion}`
    )
    .join('\n');

  const message = await bolt.client.chat.postMessage({
    channel: REQUIRED_CHECK_CHANNEL,
    text,
    attachments: [
      {
        color: Color.DANGER,
        blocks: [...commitBlocks],
      },
    ],
  });

  // Add thread for jobs list
  bolt.client.chat.postMessage({
    channel: `${message.channel}`,
    thread_ts: `${message.ts}`,
    text: `Here are the job statuses

${jobsList}`,
  });

  // Save failing required check run to db
  await saveRequiredCheck({
    ref: checkRun.head_sha,
    channel: `${message.channel}`,
    ts: `${message.ts}`,
    status: 'failure',
  });
}

export async function requiredChecks() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}
