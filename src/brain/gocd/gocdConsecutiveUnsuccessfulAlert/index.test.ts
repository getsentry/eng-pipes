import merge from 'lodash.merge';

import oldPayload from '@test/payloads/gocd/gocd-stage-building.json';
import { MockedBolt } from '@test/utils/testTypes';

import * as slackblocks from '@/blocks/slackBlocks';
import { DB_TABLE_STAGES } from '@/brain/gocd/saveGoCDStageEvents';
import { buildServer } from '@/buildServer';
import {
  DISCUSS_BACKEND_CHANNEL_ID,
  DISCUSS_FRONTEND_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
  GOCD_SENTRYIO_FE_PIPELINE_GROUP,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { GoCDResponse } from '@/types/gocd';
import { bolt as originalBolt } from '@api/slack';
import { db } from '@utils/db';

import { CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT } from './consecutiveUnsuccessfulDeploysAlert';
import { gocdConsecutiveUnsuccessfulAlert, handler } from '.';

jest.mock('@/utils/github/getUser');

describe('gocdConsecutiveUnsuccessfulAlerts', function () {
  let fastify: Fastify;
  const bolt = originalBolt as unknown as MockedBolt;
  const payload = oldPayload as GoCDResponse;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await gocdConsecutiveUnsuccessfulAlert();
    await db(DB_TABLE_STAGES).delete();
    await db('slack_messages').delete();
  });

  afterEach(async function () {
    fastify.close();
    jest.clearAllMocks();
    await db(DB_TABLE_STAGES).delete();
    await db('slack_messages').delete();
  });

  it('do nothing for non-getsentry pipeline', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: 'deploy-example-service',
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('do nothing for passing getsentry stage', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Passed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('do nothing if there is no previous deploy', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('do nothing if the number of consecutive unsuccessful deploys is within the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
      pipeline_counter: 19,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),

      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('do nothing if the number of consecutive unsuccessful deploys is within the limit and there is one building', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
      pipeline_counter: 17,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),

      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            status: 'Building',
            result: 'Unknown',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
  });

  it('post to feed-dev-infra if the number of consecutive unsuccessful deploys is over the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
      pipeline_counter: 20 - CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),

      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);
    const channels = bolt.client.chat.postMessage.mock.calls.map(
      (c) => c[0].channel
    );
    expect(channels).toContain(FEED_DEV_INFRA_CHANNEL_ID);
    expect(channels).toContain(DISCUSS_BACKEND_CHANNEL_ID);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: `❗️ *${GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME}* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
      blocks: [
        slackblocks.section(
          slackblocks.markdown(
            `❗️ *${GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME}* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`
          )
        ),
        slackblocks.section(
          slackblocks.markdown(
            `<https://deploy.getsentry.net/go/pipelines/${GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME}/20/deploy-canary/1|Latest failure> | <https://deploy.getsentry.net/go/pipelines/value_stream_map/${GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME}/17|Last good deploy> | <https://deploy-tools.getsentry.net/services/${GOCD_SENTRYIO_BE_PIPELINE_GROUP}|Deploy Tools>`
          )
        ),
      ],
    });
  });

  it('post to discuss-backend and feed-dev-infra if the number of consecutive unsuccessful backend deploys is exactly the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',
      pipeline_name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
      pipeline_counter: 20 - CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),
      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);
    const channels = bolt.client.chat.postMessage.mock.calls.map(
      (c) => c[0].channel
    );
    expect(channels).toContain(FEED_DEV_INFRA_CHANNEL_ID);
    expect(channels).toContain(DISCUSS_BACKEND_CHANNEL_ID);
  });

  it('does not post to discuss-backend again when consecutive unsuccessful backend deploys exceeds the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',
      pipeline_name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
      pipeline_counter: 20 - CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT - 1,
      pipeline_group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),
      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_CONSECUTIVE_PIPELINE_NAME,
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    await handler(gocdPayload);

    // feed-dev-infra fires (>= threshold), but discuss-backend does not (not exactly threshold)
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });
    const channels = bolt.client.chat.postMessage.mock.calls.map(
      (c) => c[0].channel
    );
    expect(channels).not.toContain(DISCUSS_BACKEND_CHANNEL_ID);
  });

  it('post to discuss-frontend and feed-dev-infra if the number of consecutive unsuccessful frontend deploys is over the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',
      pipeline_name: GOCD_SENTRYIO_FE_PIPELINE_NAME,
      pipeline_counter: 20 - CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT,
      pipeline_group: GOCD_SENTRYIO_FE_PIPELINE_GROUP,
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
              revision: '333333',
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              data: {},
            },
          ],
        },
      ]),

      stage_name: 'deploy-primary',
      stage_counter: 1,
      stage_approval_type: '',
      stage_approved_by: '',
      stage_state: 'Passed',
      stage_result: 'unknown',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_last_transition_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_FE_PIPELINE_NAME,
          group: GOCD_SENTRYIO_FE_PIPELINE_GROUP,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: `❗️ *getsentry-frontend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
      blocks: [
        slackblocks.section(
          slackblocks.markdown(
            `❗️ *getsentry-frontend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`
          )
        ),
        slackblocks.section(
          slackblocks.markdown(
            `<https://deploy.getsentry.net/go/pipelines/getsentry-frontend/20/deploy-canary/1|Latest failure> | <https://deploy.getsentry.net/go/pipelines/value_stream_map/getsentry-frontend/17|Last good deploy> | <https://deploy-tools.getsentry.net/services/getsentry-frontend|Deploy Tools>`
          )
        ),
      ],
    });
    expect(bolt.client.chat.postMessage.mock.calls[1][0]).toMatchObject({
      text: `❗️ *getsentry-frontend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`,
      channel: DISCUSS_FRONTEND_CHANNEL_ID,
      blocks: [
        slackblocks.section(
          slackblocks.markdown(
            `❗️ *getsentry-frontend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`
          )
        ),
        slackblocks.section(
          slackblocks.markdown(
            `<https://deploy.getsentry.net/go/pipelines/getsentry-frontend/20/deploy-canary/1|Latest failure> | <https://deploy.getsentry.net/go/pipelines/value_stream_map/getsentry-frontend/17|Last good deploy> | <https://deploy-tools.getsentry.net/services/getsentry-frontend|Deploy Tools>`
          )
        ),
      ],
    });
  });
});
