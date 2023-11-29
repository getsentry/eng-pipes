import gocdagentpayload from '@test/payloads/gocd/gocd-agent.json';
import gocdSnubaMigratePayload from '@test/payloads/gocd/gocd-snuba-build-passed.json';
import gocdStateChecksPayload from '@test/payloads/gocd/gocd-stage-checks.json';
import gocdFrontendBuilding from '@test/payloads/gocd/gocd-stage-deploy-frontend.json';
import testEmptyPayload from '@test/payloads/sentry-options/testEmptyPayload.json';

import { buildServer } from '@/buildServer';
import { DATADOG_API_INSTANCE } from '@/config';
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
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: testEmptyPayload,
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook ignore agent payload', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdagentpayload,
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook ignore checks stage payload', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdStateChecksPayload,
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(0);
  });

  it('webhook snuba payload', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdSnubaMigratePayload,
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
  });

  describe('sendSentryOptionsUpdatesToDataDog tests', function () {
    it('should send the right payload', async function () {
      await handler(gocdFrontendBuilding);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title:
            'GoCD: deploying <getsentry-control-frontend> <deploy> <In progress> in de',
          text:
            '%%% \n' +
            'GoCD auto-deployment started from: [getsentry@d2501d598f97](https://github.com/getsentry/getsentry/commits/d2501d598f97829b43627ba5d5721013f1d217dc),   GoCD:[In progress](https://deploy.getsentry.net/go/pipelines/deploy-getsentry-control-frontend-test/2523/deploy/1)\n' +
            ' *this message was produced by a eng-pipes gocd brain module* \n' +
            ' %%%',
          tags: [
            'region:de',
            'source_tool:gocd',
            'source:"gocd"',
            'source_category:infra-tools',
            'sentry_service:getsentry-control-frontend',
            'sentry_user:eng-pipes',
          ],
        },
      });
    });

    it('should handle different ', async function () {
      await handler(gocdSnubaMigratePayload);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          title:
            'GoCD: deploying <snuba> <st_migrate> <Passed> in st-zendesk-eu',
          text:
            '%%% \n' +
            'GoCD auto-deployment started from: [snuba@4d71a785da42](https://github.com/getsentry/snuba/commits/4d71a785da42db5606c2c82bb5a91adfb5006fc7),   GoCD:[Passed](https://deploy.getsentry.net/go/pipelines/deploy-snuba-customer-3/168/st_migrate/1)\n' +
            ' *this message was produced by a eng-pipes gocd brain module* \n' +
            ' %%%',
          tags: [
            'region:st-zendesk-eu',
            'source_tool:gocd',
            'source:"gocd"',
            'source_category:infra-tools',
            'sentry_service:snuba',
            'sentry_user:eng-pipes',
          ],
        },
      });
    });
  });
});
