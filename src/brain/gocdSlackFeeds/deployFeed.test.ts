import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';

import * as slackblocks from '@/blocks/slackBlocks';
import { Color } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDPipeline } from '@/types';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { DeployFeed } from './deployFeed';

jest.mock('@api/getUser');

describe('DeployFeed', () => {
  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    await db('slack_messages').delete();
  });

  afterEach(async function () {
    jest.clearAllMocks();
    await db('slack_messages').delete();
  });

  it('post message to feed without filter', async () => {
    const gocdPayload = merge({}, payload);

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
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
                slackblocks.markdown('⏳ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });

    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    });
  });

  it('post message to feed with filter', async () => {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: 'ONLY_THIS_PIPELINE',
        },
      },
    });

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
      pipelineFilter: (pipeline: GoCDPipeline) => {
        return pipeline.name == 'ONLY_THIS_PIPELINE';
      },
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    let slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);

    const filterOutPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: 'FILTER_OUT_THIS_PIPELINE',
        },
      },
    });
    await feed.handle(filterOutPayload);
    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
  });

  it('post auto-deploy message to feed without filter', async () => {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          stage: {
            'approved-by': 'changes',
            result: 'Passed',
          },
        },
      },
    });

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD auto-deployment started',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
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
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it('post message and update to user', async () => {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          stage: {
            'approved-by': 'test@sentry.io',
            result: 'Cancelled',
          },
        },
      },
    });

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started by <@U018H4DA8N5>',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
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
                slackblocks.markdown('🛑 *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|Cancelled>'
                ),
              ],
            },
          ],
        },
      ],
    });

    let slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started by <@U018H4DA8N5>',
      },
    });

    const failedPayload = merge({}, payload, {
      data: {
        pipeline: {
          stage: {
            'approved-by': 'test@sentry.io',
            result: 'Failed',
          },
        },
      },
    });
    await feed.handle(failedPayload);

    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started by <@U018H4DA8N5>',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
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
                slackblocks.markdown('❌ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|Failed>'
                ),
              ],
            },
          ],
        },
      ],
    });
    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0]).toMatchObject({
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      channel: 'channel_id',
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started by <@U018H4DA8N5>',
      },
    });
  });

  it('handle no build cause and no approved by', async () => {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          stage: {
            'approved-by': '',
            result: 'Unexpected Result',
          },
        },
      },
    });
    gocdPayload.data.pipeline['build-cause'] = [];

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
            ),
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('❓ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|Unexpected Result>'
                ),
              ],
            },
          ],
        },
      ],
    });

    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
  });

  it('handle URL that is not a GitHub url', async () => {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          'build-cause': [
            {
              material: {
                type: 'git',
                'git-configuration': {
                  url: 'git://www.gitlab.com/getsentry/sentry.git',
                },
              },
            },
          ],
        },
      },
    });

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'example-channel-id',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'example-channel-id',
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/getsentry_frontend*')
            ),
            {
              elements: [
                slackblocks.markdown('Deploying'),
                slackblocks.markdown(
                  'git://www.gitlab.com/getsentry/sentry.git @ 2b0034becc4a'
                ),
              ],
            },
            slackblocks.divider(),
            {
              elements: [
                slackblocks.markdown('⏳ *preliminary-checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry_frontend/20/preliminary-checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });

    const slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(1);
  });
});
