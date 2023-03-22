import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';

import { buildServer } from '@/buildServer';
import {
  Color,
  FEED_DEV_PROD_CHANNEL_ID,
  GOCD_ORIGIN,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { FAILED_MSG, INPROGRESS_MSG } from '@/utils/gocdHelpers';
import { getUser } from '@api/getUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { gocdDevInfraSlackFeed, handler } from '.';

jest.mock('@api/getUser');

describe('gocdDevInfraSlackFeed', function () {
  let fastify: Fastify;
  const PIPELINE_NAME = 'example_pipeline';
  const gocdPayload = merge({}, payload, {
    data: {
      pipeline: {
        name: PIPELINE_NAME,
      },
    },
  });

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await gocdDevInfraSlackFeed();
    await db('slack_messages').delete();
  });

  afterEach(async function () {
    fastify.close();
    (bolt.client.chat.postMessage as jest.Mock).mockClear();
    (bolt.client.chat.update as jest.Mock).mockClear();
  });

  it('post message and update on change', async function () {
    // First Event
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
            stage: {
              result: 'Failed',
            },
          },
        },
      })
    );
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment',
      channel: FEED_DEV_PROD_CHANNEL_ID,
      attachments: [
        {
          color: Color.DANGER,
          author_name: `sentryio/${GOCD_SENTRYIO_BE_PIPELINE_NAME}`,
          text: `step "preliminary-checks" <${GOCD_ORIGIN}/go/pipelines/${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20/preliminary-checks/1|${FAILED_MSG}>`,
          footer: `<${GOCD_ORIGIN}/go/tab/build/detail/${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20/preliminary-checks/1/preliminary-checks|Job Logs>`,
        },
      ],
    });

    let slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: `sentryio-${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment',
      },
    });

    // Second Event
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
            stage: {
              result: 'Passed',
            },
          },
        },
      })
    );
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update.mock.calls[0][0]).toMatchObject({
      ts: '1234123.123',
      text: 'GoCD deployment',
      channel: FEED_DEV_PROD_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          author_name: `sentryio/${GOCD_SENTRYIO_BE_PIPELINE_NAME}`,
          text: `step "preliminary-checks" <${GOCD_ORIGIN}/go/pipelines/${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20/preliminary-checks/1|${INPROGRESS_MSG}>`,
          footer: `<${GOCD_ORIGIN}/go/tab/build/detail/${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20/preliminary-checks/1/preliminary-checks|Job Logs>`,
        },
      ],
    });

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: `sentryio-${GOCD_SENTRYIO_BE_PIPELINE_NAME}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment',
      },
    });
  });

  it('do nothing if the result is not a failure', async function () {
    getUser.mockImplementation(() => ({
      email: 'example-user@sentry.io',
      slackUser: 'U018H4DA8N5',
    }));

    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: {
              name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
              result: 'Cancelled',
            },
          },
        },
      })
    );

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(0);
  });

  it('do nothing if the pipeline is not in our filter set', async function () {
    getUser.mockImplementation(() => ({
      email: 'example-user@sentry.io',
      slackUser: 'U018H4DA8N5',
    }));

    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: {
              result: 'Failed',
            },
          },
        },
      })
    );

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(0);
  });
});
