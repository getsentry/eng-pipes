import merge from 'lodash.merge';

import payloadRaw from '@test/payloads/gocd/gocd-stage-building.json';
import { MockedBolt } from '@test/utils/testTypes';

import * as slackblocks from '@/blocks/slackBlocks';
import { Color, GETSENTRY_ORG } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDPipeline, GoCDResponse } from '@/types/gocd';
import { bolt as originalBolt } from '@api/slack';
import { db } from '@utils/db';

import { MockedGitHubAPI } from '../../../../test/utils/testTypes';

import { DeployFeed } from './deployFeed';

jest.mock('@/utils/github/getUser');

describe('DeployFeed', () => {
  const org = GETSENTRY_ORG as unknown as { api: MockedGitHubAPI };
  const bolt = originalBolt as unknown as MockedBolt;
  const payload = payloadRaw as GoCDResponse;

  beforeAll(async function () {
    await db.migrate.latest();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {
    await db('slack_messages').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();
  });

  afterEach(async function () {
    jest.clearAllMocks();
    await db('slack_messages').delete();
    await db('gocd-stages').delete();
    await db('gocd-stage-materials').delete();
  });

  it('post message to feed without filter', async () => {
    const gocdPayload = merge({}, payload);

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'messages-without-filter-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'messages-without-filter-channel',
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
      channel: 'messages-without-filter-channel',
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
      channelID: 'messages-with-filter-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
      pipelineFilter: (pipeline: GoCDPipeline) => {
        return pipeline.name === 'ONLY_THIS_PIPELINE';
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
      channelID: 'auto-deploy-messages-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD auto-deployment started',
      channel: 'auto-deploy-messages-channel',
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
      channelID: 'update-user-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started by <@U018H4DA8N5>',
      channel: 'update-user-channel',
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
      channel: 'update-user-channel',
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
      channel: 'update-user-channel',
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
      channel: 'update-user-channel',
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
      channelID: 'no-build-cause-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'no-build-cause-channel',
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
      channelID: 'url-test-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'url-test-channel',
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

  it('post message with commits in deploy link for non-getsentry', async () => {
    await db('gocd-stages').insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: payload.data.pipeline.name,
      pipeline_counter: 2,
      pipeline_group: payload.data.pipeline.group,
      pipeline_build_cause: JSON.stringify([
        {
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:getsentry/example.git',
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

    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          'build-cause': [
            {
              material: {
                type: 'git',
                'git-configuration': {
                  url: 'git://github.com/getsentry/example.git',
                },
              },
            },
          ],
        },
      },
    });

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'non-getsentry-commits-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'non-getsentry-commits-channel',
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
                  '<https://github.com/getsentry/example/commits/2b0034becc4ab26b985f4c1a08ab068f153c274c|example@2b0034becc4a>'
                ),
                slackblocks.markdown(
                  '<https://github.com/getsentry/example/compare/111111...2b0034becc4ab26b985f4c1a08ab068f153c274c|Commits being deployed>'
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

  it('post message with commits in deploy link for getsentry', async () => {
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

      pipeline_name: payload.data.pipeline.name,
      pipeline_counter: 2,
      pipeline_group: payload.data.pipeline.group,
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

    const gocdPayload = merge({}, payload, {
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

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'getsentry-commits-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'getsentry-commits-channel',
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
                slackblocks.markdown(
                  'Commits being deployed: <https://github.com/getsentry/getsentry/compare/111111...2b0034becc4ab26b985f4c1a08ab068f153c274c|getsentry> | <https://github.com/getsentry/sentry/compare/222222...333333|sentry>'
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

    expect(org.api.repos.getContent).toBeCalledTimes(2);
  });

  it('handle error if get content fails', async () => {
    org.api.repos.getContent.mockImplementation((_args) => {
      throw new Error('Injected error');
    });

    await db('gocd-stages').insert({
      pipeline_id: 'pipeline-id-123',

      pipeline_name: payload.data.pipeline.name,
      pipeline_counter: 2,
      pipeline_group: payload.data.pipeline.group,
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

    const gocdPayload = merge({}, payload, {
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

    const feed = new DeployFeed({
      feedName: 'example-feed',
      channelID: 'handle-error-channel',
      msgType: SlackMessage.FEED_ENG_DEPLOY,
    });
    await feed.handle(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.postMessage.mock.calls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: 'handle-error-channel',
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
                slackblocks.markdown(
                  '<https://github.com/getsentry/getsentry/compare/111111...2b0034becc4ab26b985f4c1a08ab068f153c274c|Commits being deployed>'
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
