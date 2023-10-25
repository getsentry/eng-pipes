import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';

import * as slackblocks from '@/blocks/slackBlocks';
import { DB_TABLE_STAGES } from '@/brain/saveGoCDStageEvents';
import { buildServer } from '@/buildServer';
import {
  FEED_DEV_INFRA_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_GROUP,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT } from './consecutiveUnsuccessfulDeploysAlert';
import { gocdConsecutiveUnsuccessfulAlert, handler } from '.';

jest.mock('@api/getUser');

describe('gocdConsecutiveUnsuccessfulAlerts', function () {
  let fastify: Fastify;

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
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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

      pipeline_name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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
      stage_last_transition_time: new Date(),
      stage_jobs: '{}',
    });

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          group: GOCD_SENTRYIO_BE_PIPELINE_GROUP,
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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

  it('post to feed-dev-infra if the number of consecutive unsuccessful deploys is over the limit', async function () {
    await db(DB_TABLE_STAGES).insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
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

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: `❗️ *getsentry-backend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
      blocks: [
        slackblocks.section(
          slackblocks.markdown(
            `❗️ *getsentry-backend* has had ${CONSECUTIVE_UNSUCCESSFUL_DEPLOYS_LIMIT} consecutive unsuccessful deploys.`
          )
        ),
        slackblocks.section(
          slackblocks.markdown(
            `<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/deploy-canary/1|Latest failure> | <https://deploy.getsentry.net/go/pipelines/value_stream_map/getsentry-backend/17|Last good deploy> | <https://deploy-tools.getsentry.net/services/getsentry-backend|Deploy Tools>`
          )
        ),
      ],
    });
  });
});
