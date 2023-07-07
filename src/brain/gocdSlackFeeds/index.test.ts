import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';

import * as slackblocks from '@/blocks/slackBlocks';
import { buildServer } from '@/buildServer';
import {
  Color,
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_ENGINEERING_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { gocdSlackFeeds, handler } from '.';

jest.mock('@api/getUser');

describe('gocdSlackFeeds', function () {
  let fastify: Fastify;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    fastify = await buildServer(false);
    await gocdSlackFeeds();
    await db('slack_messages').delete();
  });

  afterEach(async function () {
    fastify.close();
    jest.clearAllMocks();
    await db('slack_messages').delete();
  });

  it('post and update message to all feeds', async function () {
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

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);

    const wantPostMsg = {
      text: 'GoCD deployment started',
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry-backend*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry@2b0034becc4a>'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('❌ *deploy-canary*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/deploy-canary/1|Failed>'
                ),
              ],
            },
          ],
        },
      ],
    };
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);

    const sortMessages = (ao, bo) => {
      const a = ao[0].channel;
      const b = bo[0].channel;
      if (a < b) {
        return 1;
      }
      if (a > b) {
        return -1;
      }
      return 0;
    };
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject(wantSlack);
    expect(slackMessages[1]).toMatchObject(wantSlack);
    expect(slackMessages[2]).toMatchObject(wantSlack);

    // Second Event
    await handler(
      merge({}, gocdPayload, {
        data: {
          pipeline: {
            stage: {
              'approved-by': 'changes',
              result: 'Passed',
            },
          },
        },
      })
    );

    const wantUpdate = {
      ts: '1234123.123',
      text: 'GoCD deployment started',
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry-backend*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry@2b0034becc4a>'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('✅ *deploy-canary*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/deploy-canary/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    };
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(3);
    const updateCalls = bolt.client.chat.update.mock.calls;
    updateCalls.sort(sortMessages);
    expect(updateCalls[0][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post message to feed-deploy only for passing pipeline', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            result: 'Passed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry-backend*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry@2b0034becc4a>'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('✅ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/preliminary-checks/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it('post message to feed-deploy only for failing checks', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'checks',
            result: 'Failed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry-backend*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry@2b0034becc4a>'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('❌ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/checks/1|Failed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it('post message to feed-deploy only misc pipeline', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: 'misc-pipeline',
          stage: {
            result: 'Passed',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/misc-pipeline*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry@2b0034becc4a>'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('✅ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/misc-pipeline/20/preliminary-checks/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });
});
