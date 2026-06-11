import { DB_TABLE_STAGES } from '@/brain/gocd/saveGoCDStageEvents';
import { DBGoCDDeployment } from '@/types/gocd';

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

export async function getLastGetSentryGoCDDeploy(
  pipeline_group: string,
  pipeline_name: string,
  beforeCounter?: string
): Promise<DBGoCDDeployment | undefined> {
  const query = db
    .select('*')
    .from(DB_TABLE_STAGES)
    .where({ pipeline_group, pipeline_name })
    .whereRaw('LOWER(stage_state) = ?', ['passed'])
    .orderBy('pipeline_counter', 'desc');
  if (beforeCounter !== undefined) {
    query.where('pipeline_counter', '<', Number(beforeCounter));
  }
  return await query.first();
}
