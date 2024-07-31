import merge from 'lodash.merge';

import gocdagentpayload from '@test/payloads/gocd/gocd-agent.json';
import gocdSnubaMigratePayload from '@test/payloads/gocd/gocd-snuba-build-passed.json';
import gocdStageBuildingDeploying from '@test/payloads/gocd/gocd-stage-building-deploying.json';
import gocdStateChecksPayload from '@test/payloads/gocd/gocd-stage-checks.json';
import gocdFrontendBuilding from '@test/payloads/gocd/gocd-stage-deploy-frontend.json';
import testEmptyPayload from '@test/payloads/sentry-options/testEmptyPayload.json';
import { createGoCDRequest } from '@test/utils/createGoCDRequest';

import { buildServer } from '@/buildServer';
import { DATADOG_API_INSTANCE, GETSENTRY_ORG } from '@/config';
import { db } from '@utils/db';

import { gocdDataDog, handler } from '.';

jest.mock('@api/getUser');

describe('GocdDatadogEvents', () => {
  let fastify, datadogApiInstanceSpy;

  beforeAll(async function () {
    await db.migrate.latest();
    await gocdDataDog();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    await db('slack_messages').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();

    fastify = await buildServer(false);
    datadogApiInstanceSpy = jest
      .spyOn(DATADOG_API_INSTANCE, 'createEvent')
      .mockImplementation(jest.fn());
  });

  afterEach(async function () {
    fastify.close();
    jest.clearAllMocks();
    await db('slack_messages').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();
  });

  it('webhook working empty payload', async function () {
    const response = await createGoCDRequest(fastify, testEmptyPayload);
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook ignore agent payload', async function () {
    const response = await createGoCDRequest(fastify, gocdagentpayload);
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook ignore checks stage payload', async function () {
    const response = await createGoCDRequest(fastify, gocdStateChecksPayload);
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook snuba payload', async function () {
    const response = await createGoCDRequest(fastify, gocdSnubaMigratePayload);
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // TODO: uncomment when fixed
    // expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
  });

  describe('sendSentryOptionsUpdatesToDataDog tests', function () {
    it('should send the right payload', async function () {
      await handler(gocdFrontendBuilding);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title:
            'GoCD: deploying <getsentry-control-frontend> <deploy> <In progress> in all',
          text:
            '%%% \n' +
            'GoCD auto-deployment started from: [getsentry@d2501d598f97](https://github.com/getsentry/getsentry/commits/d2501d598f97829b43627ba5d5721013f1d217dc),\n' +
            ' \n' +
            '  \n' +
            ' GoCD:[In progress](https://deploy.getsentry.net/go/pipelines/deploy-getsentry-control-frontend-test/2523/deploy/1) \n' +
            '\n' +
            '   *this message was produced by a eng-pipes gocd brain module* ' +
            '\n %%%',
          tags: [
            'sentry_region:all',
            'source_tool:gocd',
            'source:gocd',
            'source_category:infra-tools',
            'sentry_service:getsentry-control-frontend',
            'gocd_status:In progress',
            'gocd_stage:deploy',
            `sentry_user:eng-pipes`,
          ],
        },
      });
    });

    it('handle kicked off by slack user', async function () {
      const gocdPayload = merge({}, gocdFrontendBuilding, {
        data: {
          pipeline: {
            stage: {
              'approved-by': 'test@sentry.io',
              result: 'Cancelled',
            },
          },
        },
      });
      await handler(gocdPayload);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title:
            'GoCD: deploying <getsentry-control-frontend> <deploy> <Cancelled> in all',
          text:
            '%%% \n' +
            'GoCD deployment started by <@U018H4DA8N5> from: [getsentry@d2501d598f97](https://github.com/getsentry/getsentry/commits/d2501d598f97829b43627ba5d5721013f1d217dc),\n' +
            ' \n' +
            '  \n' +
            ' GoCD:[Cancelled](https://deploy.getsentry.net/go/pipelines/deploy-getsentry-control-frontend-test/2523/deploy/1) \n' +
            '\n' +
            '   *this message was produced by a eng-pipes gocd brain module* ' +
            '\n %%%',
          tags: [
            'sentry_region:all',
            'source_tool:gocd',
            'source:gocd',
            'source_category:infra-tools',
            'sentry_service:getsentry-control-frontend',
            'gocd_status:Cancelled',
            'gocd_stage:deploy',
            `sentry_user:eng-pipes`,
          ],
        },
      });
    });

    it('post message with commits in deploy link for getsentry', async () => {
      const org = GETSENTRY_ORG;

      org.api.repos.getContent.mockImplementation((args) => {
        if (args.owner !== 'getsentry') {
          throw new Error(`Unexpected getContent() owner: ${args.owner}`);
        }
        if (args.repo !== 'getsentry') {
          throw new Error(`Unexpected getContent() owner: ${args.owner}`);
        }
        if (args.path !== 'sentry-version') {
          throw new Error(`Unexpected getContent() owner: ${args.owner}`);
        }
        const mapping = {
          '111111': '222222',
          '2b0034becc4ab26b985f4c1a08ab068f153c274c': '333333',
        };
        return {
          status: 200,
          data: {
            content: Buffer.from(`${mapping[args.ref]}\n`, 'ascii').toString(
              'base64'
            ),
            encoding: 'base64',
          },
        };
      });

      await db('gocd-stages').insert({
        pipeline_id: 'pipeline-id-123',

        pipeline_name: gocdStageBuildingDeploying.data.pipeline.name,
        pipeline_counter: 2,
        pipeline_group: gocdStageBuildingDeploying.data.pipeline.group,
        pipeline_build_cause: JSON.stringify([
          {
            material: {
              'git-configuration': {
                'shallow-clone': false,
                branch: 'master',
                url: 'git@github.com:getsentry/getsentry.git',
              },
              type: 'git',
            },
            changed: false,
            modifications: [
              {
                revision: '111111',
                'modified-time': 'Oct 26, 2022, 5:05:17 PM',
                data: {},
              },
            ],
          },
        ]),

        stage_name: 'deploy',
        stage_counter: 1,
        stage_approval_type: '',
        stage_approved_by: '',
        stage_state: 'Passed',
        stage_result: 'unknown',
        stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
        stage_jobs: '{}',
      });

      const gocdPayload = merge({}, gocdStageBuildingDeploying, {
        data: {
          pipeline: {
            'build-cause': [
              {
                material: {
                  type: 'git',
                  'git-configuration': {
                    url: 'git://github.com/getsentry/getsentry.git',
                  },
                },
              },
            ],
          },
        },
      });

      await handler(gocdPayload);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title: 'GoCD: deploying <sentryio> <deploying> <In progress> in all',
          text:
            '%%% \n' +
            'GoCD deployment started from: [getsentry@2b0034becc4a](https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c),\n' +
            ' \n' +
            ' Commits being deployed: [getsentry](https://github.com/getsentry/getsentry/compare/111111...2b0034becc4ab26b985f4c1a08ab068f153c274c) | [sentry](https://github.com/getsentry/sentry/compare/222222...333333) \n' +
            ' GoCD:[In progress](https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/deploying/1) \n' +
            '\n' +
            '   *this message was produced by a eng-pipes gocd brain module* ' +
            '\n %%%',
          tags: [
            'sentry_region:all',
            'source_tool:gocd',
            'source:gocd',
            'source_category:infra-tools',
            'sentry_service:sentryio',
            'gocd_status:In progress',
            'gocd_stage:deploying',
            'sentry_user:eng-pipes',
            'sentry_user:MeredithAnya',
            'sentry_user:Zylphrex',
          ],
        },
      });
      expect(org.api.repos.getContent).toBeCalledTimes(2);
    });

    it('should handle snuba ', async function () {
      await handler(gocdSnubaMigratePayload);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title: 'GoCD: deploying <snuba> <st_migrate> <Passed> in us',
          text:
            '%%% \n' +
            'GoCD auto-deployment started from: [snuba@4d71a785da42](https://github.com/getsentry/snuba/commits/4d71a785da42db5606c2c82bb5a91adfb5006fc7),\n' +
            ' \n' +
            '  \n' +
            ' GoCD:[Passed](https://deploy.getsentry.net/go/pipelines/deploy-snuba-us/168/st_migrate/1) \n' +
            '\n' +
            '   *this message was produced by a eng-pipes gocd brain module* ' +
            '\n %%%',
          tags: [
            'sentry_region:us',
            'source_tool:gocd',
            'source:gocd',
            'source_category:infra-tools',
            'sentry_service:snuba',
            'gocd_status:Passed',
            'gocd_stage:st_migrate',
            'sentry_user:eng-pipes',
          ],
        },
      });
    });
  });
});
