import { GoCDBuildMaterial, GoCDResponse } from '@/types';
import { gocdevents } from '@api/gocdevents';
import { db } from '@utils/db';

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

async function saveBuildMaterials(pipeline_id, pipeline) {
  const gocdMaterials: Array<GoCDBuildMaterial> = [];
  for (const bc of pipeline['build-cause']) {
    if (!bc.material || bc.material.type != 'git') {
      throw new Error('Unexpected GoCD build-case material');
    }
    if (bc.modifications.length == 0) {
      throw new Error('No GoCD modification for material');
    }

    const gitConfig = bc.material['git-configuration'];
    const modification = bc.modifications[0];

    gocdMaterials.push({
      stage_material_id: `${pipeline_id}_${gitConfig.url}_${modification.revision}`,
      pipeline_id: pipeline_id,
      url: gitConfig.url,
      branch: gitConfig.branch,
      revision: modification.revision,
    });
  }
  await db(DB_TABLE_MATERIALS).insert(gocdMaterials);
}

export async function saveGoCDStageEvents() {
  gocdevents.on('stage', handler);
}