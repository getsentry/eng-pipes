import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import { GOCD_ORIGIN } from '@/config';

describe('getUpdatedGoCDDeployMessage', function () {
  const CURRENT_USER = 'current-user';
  const scenarios = [
    // Building
    {
      currentUser: CURRENT_USER,
      state: 'Building',
      want: `You have begun deploying this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },
    {
      currentUser: 'diff-user',
      state: 'Building',
      want: `diff-user has begun deploying this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },

    // Passed
    {
      currentUser: CURRENT_USER,
      state: 'Passed',
      want: `You have finished deploying this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },
    {
      currentUser: 'diff-user',
      state: 'Passed',
      want: `diff-user has finished deploying this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },

    // Unknown / Failed
    {
      currentUser: CURRENT_USER,
      state: 'Other',
      want: `You have failed to deploy this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },
    {
      currentUser: 'diff-user',
      state: 'Other',
      want: `diff-user has failed to deploy this commit (<${GOCD_ORIGIN}/go/pipelines/example-pipeline/undefined/example-stage/3|example-pipeline: Stage 3>)`,
    },
  ];

  for (const s of scenarios) {
    it(`return message for ${s.currentUser} - ${s.state}`, async function () {
      const got = getUpdatedGoCDDeployMessage({
        isUserDeploying: s.currentUser == CURRENT_USER,
        slackUser: s.currentUser,
        pipeline: {
          pipeline_name: 'example-pipeline',
          pipline_counter: 2,
          stage_name: 'example-stage',
          stage_counter: 3,
          stage_state: s.state,
        },
      });
      expect(got).toEqual(s.want);
    });
  }
});
