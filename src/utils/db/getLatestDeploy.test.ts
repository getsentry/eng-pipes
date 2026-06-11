import { DB_TABLE_STAGES } from '@/brain/gocd/saveGoCDStageEvents';
import { db } from '@utils/db';

import { FINAL_STAGE_NAMES } from '../gocd/gocdHelpers';

import { getLastGetSentryGoCDDeploy } from './getLatestDeploy';

describe('getLatestDeploy', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  afterEach(async function () {
    await db(DB_TABLE_STAGES).delete();
  });

  describe('getLastGetSentryGoCDDeploy', function () {
    it('return nothing when no deploys', async function () {
      const got = await getLastGetSentryGoCDDeploy(
        'example-pipeline-group',
        'example-pipeline-name'
      );
      expect(got).toEqual(undefined);
    });

    it('return latest GoCD deploy', async function () {
      const materials = [
        {
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:example/example-1.git',
            },
            type: 'git',
          },
          changed: false,
          modifications: [
            {
              revision: 'abc123',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
        {
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:example/example-2.git',
            },
            type: 'git',
          },
          changed: false,
          modifications: [
            {
              revision: 'def456',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ];

      const pipeline = {
        pipeline_id: 'pipeline-id-123',

        pipeline_name: 'example-pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'example-pipeline-group',
        pipeline_build_cause: JSON.stringify(materials),

        stage_name: FINAL_STAGE_NAMES[0],
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'Passed',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: '{}',
      };
      await db(DB_TABLE_STAGES).insert(pipeline);

      const got = await getLastGetSentryGoCDDeploy(
        'example-pipeline-group',
        'example-pipeline-name'
      );
      expect(got).toEqual(
        Object.assign({}, pipeline, {
          pipeline_build_cause: materials,
          stage_jobs: {},
        })
      );
    });

    const stageRow = (
      pipeline_counter: number,
      stage_name: string,
      stage_state: string
    ) => ({
      pipeline_id: `example-pipeline-group_example-pipeline-name_${pipeline_counter}`,
      pipeline_name: 'example-pipeline-name',
      pipeline_counter,
      pipeline_group: 'example-pipeline-group',
      pipeline_build_cause: '[]',
      stage_name,
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state,
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    it('return runs regardless of final stage name, skipping unsuccessful runs', async function () {
      await db(DB_TABLE_STAGES).insert([
        stageRow(1, 'deploy-relay', 'Passed'),
        stageRow(2, 'deploy-relay', 'Failed'),
      ]);

      const got = await getLastGetSentryGoCDDeploy(
        'example-pipeline-group',
        'example-pipeline-name'
      );
      expect(got?.pipeline_counter).toEqual(1);
    });

    it('exclude runs at or after beforeCounter', async function () {
      await db(DB_TABLE_STAGES).insert([
        stageRow(1, 'pipeline-complete', 'Passed'),
        stageRow(2, 'checks', 'Passed'),
      ]);

      const got = await getLastGetSentryGoCDDeploy(
        'example-pipeline-group',
        'example-pipeline-name',
        '2'
      );
      expect(got?.pipeline_counter).toEqual(1);

      const gotAll = await getLastGetSentryGoCDDeploy(
        'example-pipeline-group',
        'example-pipeline-name'
      );
      expect(gotAll?.pipeline_counter).toEqual(2);
    });
  });
});
