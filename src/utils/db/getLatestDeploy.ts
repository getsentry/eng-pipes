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
  // A run keeps one row tracking its most recent stage event, so a row resting at
  // "passed" means the run completed all of its stages, whatever they are named.
  const query = db
    .select('*')
    .from(DB_TABLE_STAGES)
    .where({ pipeline_group, pipeline_name })
    .whereRaw('LOWER(stage_state) = ?', ['passed'])
    .orderBy('pipeline_counter', 'desc');
  if (beforeCounter !== undefined) {
    // Callers handling a live stage event pass their run's counter, since that run
    // would otherwise match itself as soon as any of its stages passes.
    query.where('pipeline_counter', '<', Number(beforeCounter));
  }
  return await query.first();
}
