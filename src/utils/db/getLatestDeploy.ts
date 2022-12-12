import { db } from '.';

export async function getLatestDeploy(app_name: string) {
  return await db
    .select('*')
    .from('deploys')
    .where({
      status: 'finished',
      environment: 'production',
      app_name,
    })
    .orderBy('finished_at', 'desc')
    .first();
}

export async function getLatestGoCDDeploy(
  pipeline_group: string,
  pipeline_name: string
) {
  return await db
    .select('*')
    .from('gocd-stages')
    .where({
      pipeline_group,
      pipeline_name,
    })
    .orderBy('pipeline_counter', 'desc')
    .first();
}
