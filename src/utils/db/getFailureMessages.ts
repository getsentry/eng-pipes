import { BuildStatus, GETSENTRY_ORG, GETSENTRY_REPO_SLUG } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
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
      // We *ONLY* want failed builds before `headSha` - when calling GH's
      // `compareCommits`, we use `headSha` as the head commit, so we only want
      // the messages for failed builds that came before `headSha`.

      // This happens when say build A starts, and then after build B starts
      // and fails before A completes. In this case, build A should not mark B as being fixed
      const { data } = await GETSENTRY_ORG.api.repos.compareCommits({
        owner: GETSENTRY_ORG.slug,
        repo: GETSENTRY_REPO_SLUG,
        base: message.refId,
        head: headSha,
      });

      // If `base` is older than `head`, then we will have a `status == "ahead"`
      // Otherwise, if `base` commit comes after `head` commit, the `head` commit is considered "behind"
      // Because we are only looking for failures that come *before* the
      // `headSha` commit, we ignore messages where `status == "behind"` as
      // that means `head` is older than the commit that is referenced in the slack message
      if (data.status === 'behind') {
        return null;
      }
      return message;
    })
  );

  return onlyOlderFailedMessages.filter(Boolean);
}
