import { db } from '.';

/**
 * Cleans up queued commits that were inserted from `queueCommitsForDeploy`
 */
export async function clearQueuedCommits(head_sha: string) {
  return await db('queued_commits').where('head_sha', head_sha).delete();
}
