import { GoCDResponse } from '@/types';
import { gocdevents } from '@api/gocdevents';
import { db } from '@utils/db';

// Exported for tests
export async function handler(resBody: GoCDResponse) {
  const DB_TABLE = 'gocd-stages';

  const pipeline = resBody.data;
  const { stage } = pipeline;

  const pipeline_id = `${pipeline.group}_${pipeline.name}_${pipeline.counter}`;

  const constraints = {
    pipeline_id: pipeline_id,
  };

  const dbEntry = await db(DB_TABLE).where(constraints).first('*');

  const gocdpipeline = {
    pipeline_id: pipeline_id,

    pipeline_name: pipeline.name,
    pipeline_counter: pipeline.counter,
    pipeline_group: pipeline.group,
    pipeline_build_cause: JSON.stringify(pipeline['build-cause']),

    stage_name: stage.name,
    stage_counter: stage.counter,
    stage_approval_type: stage['approval-type'],
    stage_approved_by: stage['approved-by'],
    stage_state: stage.state,
    stage_result: stage.result,
    stage_create_time: stage['create-time'],
    stage_last_transition_time: stage['last-transition-time'],
    stage_jobs: JSON.stringify(stage.jobs),
  };
  if (!dbEntry) {
    await db(DB_TABLE).insert(gocdpipeline);
    return;
  }

  await db(DB_TABLE).where(constraints).update(gocdpipeline);
}

export async function saveGoCDStageEvents() {
  gocdevents.on('stage', handler);
}
