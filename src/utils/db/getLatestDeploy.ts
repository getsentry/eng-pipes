import { DB_TABLE_MATERIALS, DB_TABLE_STAGES } from '@/brain/saveGoCDStageEvents';
import { db } from '.';
import { DBGoCDLatestDeploy } from '@/types';

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
): Promise<DBGoCDLatestDeploy> {
  return await db
    .select('*')
    .from(DB_TABLE_STAGES)
    .where({
      pipeline_group,
      pipeline_name,
    })
    .rightJoin(
      DB_TABLE_MATERIALS,
      `${DB_TABLE_STAGES}.pipeline_id`,
      `${DB_TABLE_MATERIALS}.pipeline_id`
    )
    .orderBy('pipeline_counter', 'desc')
    .first();
}
