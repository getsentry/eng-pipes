import { EventTypesPayload } from '@octokit/webhooks';

import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { bolt } from '@api/slack';

import { githubEvents } from '@/api/github';
import { Color, GETSENTRY_REPO, OWNER, REQUIRED_CHECK_CHANNEL } from '@/config';
import { isGetsentryRequiredCheck } from '@apps/github/utils/isGetsentryRequiredCheck';

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

async function handler({
  id,
  payload,
  ...rest
}: EventTypesPayload['check_run']) {
  // Make sure this is on `getsentry` and we are examining the aggregate "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return;
  }

  const { check_run: checkRun } = payload;

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore "successful" conclusions
  if (OK_CONCLUSIONS.includes(checkRun.conclusion || '')) {
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

  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const buildLink = `<${checkRun.html_url}|View Build>`;
  const text = `${GETSENTRY_REPO}@master <${commitLink}|${commitLinkText}> is failing (${buildLink})`;
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
}

export async function requiredChecks() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}
