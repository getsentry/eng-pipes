import { db } from '.';

/**
 * Get the deploy for a queued commit.
 */
export async function getFreightDeployForQueuedCommit(sha: string) {
  return await db
    .select('*')
    .from('queued_commits')
    .rightJoin('deploys', 'queued_commits.head_sha', 'deploys.sha')
    .where('queued_commits.sha', sha)
    .first();
}

export async function getGoCDDeployForQueuedCommit(sha: string) {
  const got = await db
    .select('*')
    .from('queued_commits')
    .rightJoin(
      'gocd-stage-materials',
      'queued_commits.head_sha',
      'gocd-stage-materials.revision'
    )
    .where('queued_commits.sha', sha)
    .rightJoin(
      'gocd-stages',
      'gocd-stage-materials.pipeline_id',
      'gocd-stages.pipeline_id'
    )
    .first();
  return got;
}
