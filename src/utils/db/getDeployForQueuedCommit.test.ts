import { CompareCommits } from '@/types/github';
import { queueCommitsForDeploy } from '@/utils/db/queueCommitsForDeploy';
import { db } from '@utils/db';

import { getGoCDDeployForQueuedCommit } from './getDeployForQueuedCommit';

describe('getDeployForQueuedCommit', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  afterEach(async function () {
    await db('queued_commits').delete();
    await db('deploys').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();
  });

  describe('getGoCDDeployForQueuedCommit', function () {
    it('return nothing when no queued commit exists', async function () {
      const got = await getGoCDDeployForQueuedCommit('abc123', 'example');
      expect(got).toEqual(undefined);
    });

    it('return nothing for queued commit but no GoCD data', async function () {
      await queueCommitsForDeploy([
        {
          sha: 'abc123',
        },
      ] as CompareCommits['commits']);

      const got = await getGoCDDeployForQueuedCommit('abc123', 'example');
      expect(got).toEqual(undefined);
    });

    it('return GoCD deploy', async function () {
      await queueCommitsForDeploy([
        {
          sha: 'abc123',
        },
      ] as CompareCommits['commits']);

      await db('gocd-stages').insert({
        pipeline_id: 'pipeline-id-123',

        pipeline_name: 'pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'pipeline-group',
        pipeline_build_cause: '{}',

        stage_name: 'stage-name',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'unknown',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: '{}',
      });

      await db('gocd-stage-materials').insert({
        stage_material_id: `123_github.com/example/example`,
        pipeline_id: 'pipeline-id-123',
        url: 'github.com/example/example',
        branch: 'main',
        revision: 'abc123',
      });

      const got = await getGoCDDeployForQueuedCommit('abc123', 'pipeline-name');
      expect(got).toEqual({
        stage_material_id: `123_github.com/example/example`,
        pipeline_id: 'pipeline-id-123',
        url: 'github.com/example/example',
        branch: 'main',
        revision: 'abc123',
        head_sha: 'abc123',
        sha: 'abc123',

        pipeline_name: 'pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'pipeline-group',
        pipeline_build_cause: {},

        stage_name: 'stage-name',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'unknown',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: {},

        id: expect.any(Number),
        data: {
          sha: 'abc123',
        },
      });
    });

    it('return GoCD deploy with multiple commits', async function () {
      await queueCommitsForDeploy([
        {
          sha: 'abc123',
        },
        {
          sha: 'def456',
        },
      ]);

      await db('gocd-stages').insert({
        pipeline_id: 'pipeline-id-123',

        pipeline_name: 'pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'pipeline-group',
        pipeline_build_cause: '{}',

        stage_name: 'stage-name',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'unknown',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: '{}',
      });

      await db('gocd-stage-materials').insert([
        {
          stage_material_id: `123_github.com/example/example`,
          pipeline_id: 'pipeline-id-123',
          url: 'github.com/example/example',
          branch: 'main',
          revision: 'abc123',
        },
        {
          stage_material_id: `456_github.com/example/example`,
          pipeline_id: 'pipeline-id-123',
          url: 'github.com/example/example',
          branch: 'main',
          revision: 'def456',
        },
      ]);

      const gotNonHead = await getGoCDDeployForQueuedCommit(
        'abc123',
        'pipeline-name'
      );
      expect(gotNonHead).toEqual({
        stage_material_id: `456_github.com/example/example`,
        pipeline_id: 'pipeline-id-123',
        url: 'github.com/example/example',
        branch: 'main',
        revision: 'def456',
        head_sha: 'def456',
        sha: 'abc123',

        pipeline_name: 'pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'pipeline-group',
        pipeline_build_cause: {},

        stage_name: 'stage-name',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'unknown',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: {},

        id: expect.any(Number),
        data: {
          sha: 'abc123',
        },
      });

      const gotHead = await getGoCDDeployForQueuedCommit(
        'def456',
        'pipeline-name'
      );
      expect(gotHead).toEqual({
        stage_material_id: `456_github.com/example/example`,
        pipeline_id: 'pipeline-id-123',
        url: 'github.com/example/example',
        branch: 'main',
        revision: 'def456',
        head_sha: 'def456',
        sha: 'def456',

        pipeline_name: 'pipeline-name',
        pipeline_counter: 2,
        pipeline_group: 'pipeline-group',
        pipeline_build_cause: {},

        stage_name: 'stage-name',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'unknown',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: {},

        id: expect.any(Number),
        data: {
          sha: 'def456',
        },
      });
    });
  });
});
