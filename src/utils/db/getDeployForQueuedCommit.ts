import { db } from '.';

export async function getGoCDDeployForQueuedCommit(
  sha: string,
  pipeline_name: string
) {
  const got = await db
    .select('*')
    .from('queued_commits')
    .rightJoin(
      'gocd-stage-materials',
      'queued_commits.head_sha',
      'gocd-stage-materials.revision'
    )
    .where({
      'queued_commits.sha': sha,
      pipeline_name,
    })
    .rightJoin(
      'gocd-stages',
      'gocd-stage-materials.pipeline_id',
      'gocd-stages.pipeline_id'
    )
    .first();
  return got;
}
