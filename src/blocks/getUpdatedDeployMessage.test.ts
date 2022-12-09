import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';

describe('getUpdatedGoCDDeployMessage', function () {
  const env = process.env;

  beforeAll(() => {
    process.env = {
      GOCD_ORIGIN: 'http://deploy-example.getsentry.net',
    };
  });

  afterAll(() => {
    process.env = env;
  });

  const CURRENT_USER = 'current-user';
  const scenarios = [
    // Building
    {
      currentUser: CURRENT_USER,
      state: 'Building',
      want: 'You have queued this commit for deployment (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
    },
    {
      currentUser: 'diff-user',
      state: 'Building',
      want: 'diff-user has queued this commit for deployment (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
    },

    // Passed
    {
      currentUser: CURRENT_USER,
      state: 'Passed',
      want: 'You have finished deploying this commit (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
    },
    {
      currentUser: 'diff-user',
      state: 'Passed',
      want: 'diff-user has finished deploying this commit (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
    },

    // Unknown / Failed
    {
      currentUser: CURRENT_USER,
      state: 'Other',
      want: 'You have failed to deploy this commit (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
    },
    {
      currentUser: 'diff-user',
      state: 'Other',
      want: 'diff-user has failed to deploy this commit (<http://deploy-example.getsentry.net/go/pipelines/example-pipeline/undefined/example-stage/3>)',
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
