import { GETSENTRY_REPO, OWNER } from '@/config';
import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getClient } from '@api/github/getClient';
import { db } from '@utils/db';
import { getTimestamp } from '@utils/db/getTimestamp';

/**
 * Getsentry is considered to be "failing" if we have a failed status check
 * (which gets saved to `slack_messages`) within the last 2 hours (by default)
 *
 * Returns slack messages that have failed since `since` AND whose commits come
 * *after* the sha parameter
 */
export async function getFailureMessages(
  since: string | null | undefined = `now() - interval '2 hours'`,
  headSha?: string
) {
  const query = db('slack_messages')
    .select('*')
    .select(db.raw(`${getTimestamp(`context::json->>'failed_at'`)} as date`))
    .where({
      type: SlackMessage.REQUIRED_CHECK,
    })
    .where(db.raw(`context::json->>'status' = '${BuildStatus.FAILURE}'`))
    .orderBy('date', 'desc');

  if (since !== null) {
    query.where(
      db.raw(`${getTimestamp(`context::json->>'failed_at'`)} >= ${since}`)
    );
  }

  const messages = await query;

  if (!headSha) {
    return messages;
  }

  const onlyOlderFailedMessages = await Promise.all(
    messages.map(async (message) => {
      const octokit = await getClient(OWNER);
      const { data } = await octokit.repos.compareCommits({
        owner: OWNER,
        repo: GETSENTRY_REPO,
        base: message.refId,
        head: headSha,
      });

      // We *ONLY* want failed builds before `headSha` - when calling GH's
      // `compareCommits`, we use `headSha` as the base commit, so we only want
      // the messages for failed builds that came before `headSha`
      //
      // This happens when say build A starts, and then after build B starts
      // and fails before A completes. In this case, build A should not mark B as being fixed
      if (data.status === 'ahead') {
        return null;
      }
      return message;
    })
  );

  return onlyOlderFailedMessages.filter(Boolean);
}
