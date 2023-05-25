import { DB_TABLE_MATERIALS, DB_TABLE_STAGES } from '@/brain/saveGoCDStageEvents';
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

export async function getGoCDDeployForQueuedCommit(
  sha: string,
  pipeline_name: string
) {
  const got = await db
    .select('*')
    .from('queued_commits')
    .rightJoin(
      DB_TABLE_MATERIALS,
      'queued_commits.head_sha',
      `${DB_TABLE_MATERIALS}.revision`
    )
    .where({
      'queued_commits.sha': sha,
      pipeline_name,
    })
    .rightJoin(
      DB_TABLE_STAGES,
      `${DB_TABLE_MATERIALS}.pipeline_id`,
      `${DB_TABLE_STAGES}.pipeline_id`,
    )
    .first();
  return got;
}
