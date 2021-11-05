import { db } from '.';

/**
 * Get the deploy for a queued commit.
 */
export async function getDeployForQueuedCommit(sha: string) {
  return await db
    .select('*')
    .from('queued_commits')
    .leftJoin('deploys', 'queued_commits.head_sha', 'deploys.sha')
    .where('queued_commits.sha', sha)
    .first();
}
