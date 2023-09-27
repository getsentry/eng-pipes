import { DBGoCDBuildMaterial, GoCDPipeline, GoCDResponse } from '@/types';
import { gocdevents } from '@api/gocdevents';
import { db } from '@utils/db';
import { filterBuildCauses } from '@utils/gocdHelpers';

export const DB_TABLE_STAGES = 'gocd-stages';
export const DB_TABLE_MATERIALS = 'gocd-stage-materials';

// Exported for tests
export async function handler(resBody: GoCDResponse) {
  const { pipeline } = resBody.data;
  const { stage } = pipeline;

  const pipeline_id = `${pipeline.group}_${pipeline.name}_${pipeline.counter}`;

  const constraints = {
    pipeline_id: pipeline_id,
  };

  const dbEntry = await db(DB_TABLE_STAGES).where(constraints).first('*');

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
    await db(DB_TABLE_STAGES).insert(gocdpipeline);

    await saveBuildMaterials(pipeline_id, pipeline);

    return;
  }

  await db(DB_TABLE_STAGES).where(constraints).update(gocdpipeline);
}

async function saveBuildMaterials(pipeline_id: string, pipeline: GoCDPipeline) {
  const gitMaterials: Array<DBGoCDBuildMaterial> = [];
  const buildCauses = filterBuildCauses(pipeline, 'git');
  for (const bc of buildCauses) {
    const gitConfig = bc.material['git-configuration'];
    const modification = bc.modifications[0];

    gitMaterials.push({
      stage_material_id: `${pipeline_id}_${gitConfig.url}_${modification.revision}`,
      pipeline_id: pipeline_id,
      url: gitConfig.url,
      branch: gitConfig.branch,
      revision: modification.revision,
    });
  }

  if (gitMaterials.length === 0) {
    return;
  }

  await db(DB_TABLE_MATERIALS).insert(gitMaterials);
}

export async function saveGoCDStageEvents() {
  gocdevents.on('stage', handler);
}
