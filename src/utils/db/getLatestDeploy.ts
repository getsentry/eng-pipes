import { FINAL_STAGE_NAMES } from '../gocdHelpers';

import { db } from '.';

import { DB_TABLE_STAGES } from '~/brain/saveGoCDStageEvents';
import { DBGoCDDeployment } from '~/types';

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
  pipeline_name: string
): Promise<DBGoCDDeployment | undefined> {
  const stageParts: Array<String> = [];
  const args: Array<String> = [];
  for (const sn of FINAL_STAGE_NAMES) {
    stageParts.push('LOWER(stage_name) = ?');
    args.push(sn.toLowerCase());
  }

  const whereRaw = `( ${stageParts.join(
    ' OR '
  )} ) AND LOWER(stage_state) = ? AND pipeline_group = ? AND pipeline_name = ?`;
  args.push('passed');
  args.push(pipeline_group);
  args.push(pipeline_name);

  return await db
    .select('*')
    .from(DB_TABLE_STAGES)
    .whereRaw(whereRaw, args)
    .orderBy('pipeline_counter', 'desc')
    .first();
}
