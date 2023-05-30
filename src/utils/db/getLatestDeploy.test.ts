import { DB_TABLE_STAGES } from '@/brain/saveGoCDStageEvents';
import { db } from '@utils/db';

import { FINAL_STAGE_NAMES } from '../gocdHelpers';

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
  });
});
