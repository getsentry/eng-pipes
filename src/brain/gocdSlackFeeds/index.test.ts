import merge from 'lodash.merge';

import payload from '@test/payloads/gocd/gocd-stage-building.json';

import * as slackblocks from '@/blocks/slackBlocks';
import { buildServer } from '@/buildServer';
import {
  Color,
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_ENGINEERING_CHANNEL_ID,
  GETSENTRY_ORG,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
} from '@/config';
import { Fastify } from '@/types';
import { getUser } from '@api/getUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import {
  GOCD_USER_GUIDE_LINK,
  gocdSlackFeeds,
  handler,
  IS_ROLLBACK_NECESSARY_LINK,
  ROLLBACK_PLAYBOOK_LINK,
} from '.';

jest.mock('@api/getUser');

describe('gocdSlackFeeds', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG;

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
    org.api.repos.compareCommits.mockImplementation((args) => {
      if (args.owner !== GETSENTRY_ORG.slug) {
        throw new Error(`Unexpected compareCommits() owner: ${args.owner}`);
      }
      if (args.repo !== 'getsentry') {
        throw new Error(`Unexpected compareCommits() repo: ${args.repo}`);
      }
      return {
        status: 200,
        data: {
          commits: [
            {
              commit: {},
              author: {
                login: 'githubUser',
              },
            },
          ],
        },
      };
    });
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'deploy-backend',
                result: 'Failed',
              },
            ],
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const canaryReply = {
      channel: 'channel_id',
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(':double_vertical_bar: Canary has been paused')
        ),
        slackblocks.section(
          slackblocks.markdown(
            `The deployment pipeline has been paused due to detected issues in canary.
          Here are the steps you should follow to address the situation:\n\n
          :mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-us/20/deploy-canary/1/deploy-backend|Canary Logs>*.\n
          :sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
          :thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
          :arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
          :arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`
          )
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy:\n<@U018H4DA8N5>`
          )
        ),
      ],
    };

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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject(canaryReply);
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);
    // The reply message is not updated
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

  it('do not reply to canary if deploy-backend job is not failed', async function () {
    org.api.repos.compareCommits.mockImplementation((args) => {
      if (args.owner !== GETSENTRY_ORG.slug) {
        throw new Error(`Unexpected compareCommits() owner: ${args.owner}`);
      }
      if (args.repo !== 'getsentry') {
        throw new Error(`Unexpected compareCommits() repo: ${args.repo}`);
      }
      return {
        status: 200,
        data: {
          commits: [
            {
              commit: {},
              author: {
                login: 'githubUser',
              },
            },
          ],
        },
      };
    });
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'deploy-backend',
                result: 'Passed',
              },
              {
                name: 'another-job',
                result: 'Failed',
              },
            ],
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
    // The reply message is not updated
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

  it('post and update message to all feeds without author', async function () {
    org.api.repos.compareCommits.mockImplementation((args) => {
      if (args.owner !== GETSENTRY_ORG.slug) {
        throw new Error(`Unexpected compareCommits() owner: ${args.owner}`);
      }
      if (args.repo !== 'getsentry') {
        throw new Error(`Unexpected compareCommits() repo: ${args.repo}`);
      }
      return {
        status: 200,
        data: {
          commits: [
            {
              commit: {},
              author: {
                login: 'notGithubUser',
              },
            },
          ],
        },
      };
    });
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'deploy-backend',
                result: 'Failed',
              },
            ],
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const canaryReply = {
      channel: 'channel_id',
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(':double_vertical_bar: Canary has been paused')
        ),
        slackblocks.section(
          slackblocks.markdown(
            `The deployment pipeline has been paused due to detected issues in canary.
          Here are the steps you should follow to address the situation:\n\n
          :mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-us/20/deploy-canary/1/deploy-backend|Canary Logs>*.\n
          :sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
          :thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
          :arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
          :arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`
          )
        ),
      ],
    };

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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject(canaryReply);
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);
    // The reply message is not updated
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

  it('post and update message to all feeds with multiple authors', async function () {
    getUser.mockImplementation((args) => {
      switch (args.email) {
        case 'test@sentry.io':
          return { slackUser: 'U1234' };
        case 'test2@sentry.io':
          return { slackUser: 'U12345' };
        case 'test3@sentry.io':
          return { slackUser: 'U123456' };
        default:
          return null;
      }
    });
    org.api.repos.compareCommits.mockImplementation((args) => {
      if (args.owner !== GETSENTRY_ORG.slug) {
        throw new Error(`Unexpected compareCommits() owner: ${args.owner}`);
      }
      if (args.repo !== 'getsentry') {
        throw new Error(`Unexpected compareCommits() repo: ${args.repo}`);
      }
      return {
        status: 200,
        data: {
          commits: [
            {
              commit: { author: { email: 'test@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test2@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test3@sentry.io' } },
              author: {},
            },
          ],
        },
      };
    });
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'deploy-backend',
                result: 'Failed',
              },
            ],
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const canaryReply = {
      channel: 'channel_id',
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(':double_vertical_bar: Canary has been paused')
        ),
        slackblocks.section(
          slackblocks.markdown(
            `The deployment pipeline has been paused due to detected issues in canary.
          Here are the steps you should follow to address the situation:\n\n
          :mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-us/20/deploy-canary/1/deploy-backend|Canary Logs>*.\n
          :sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
          :thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
          :arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
          :arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`
          )
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy:\n<@U1234> <@U12345> <@U123456>`
          )
        ),
      ],
    };

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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject(canaryReply);
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);
    // The reply message is not updated
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

  it('post and update message to all feeds with more than 10 authors', async function () {
    getUser.mockImplementation((args) => {
      switch (args.email) {
        case 'test@sentry.io':
          return { slackUser: 'U1230' };
        case 'test2@sentry.io':
          return { slackUser: 'U1231' };
        case 'test3@sentry.io':
          return { slackUser: 'U1232' };
        case 'test4@sentry.io':
          return { slackUser: 'U1233' };
        case 'test5@sentry.io':
          return { slackUser: 'U1234' };
        case 'test6@sentry.io':
          return { slackUser: 'U1235' };
        case 'test7@sentry.io':
          return { slackUser: 'U1236' };
        case 'test8@sentry.io':
          return { slackUser: 'U1237' };
        case 'test9@sentry.io':
          return { slackUser: 'U1238' };
        case 'test10@sentry.io':
          return { slackUser: 'U1239' };
        case 'test11@sentry.io':
          return { slackUser: 'U12310' };
        default:
          return null;
      }
    });
    org.api.repos.compareCommits.mockImplementation((args) => {
      if (args.owner !== GETSENTRY_ORG.slug) {
        throw new Error(`Unexpected compareCommits() owner: ${args.owner}`);
      }
      if (args.repo !== 'getsentry') {
        throw new Error(`Unexpected compareCommits() repo: ${args.repo}`);
      }
      return {
        status: 200,
        data: {
          commits: [
            {
              commit: { author: { email: 'test@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test2@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test3@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test4@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test5@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test6@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test7@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test8@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test9@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test10@sentry.io' } },
              author: {},
            },
            {
              commit: { author: { email: 'test11@sentry.io' } },
              author: {},
            },
          ],
        },
      };
    });
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: GOCD_SENTRYIO_BE_PIPELINE_NAME,
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'deploy-backend',
                result: 'Failed',
              },
            ],
          },
        },
      },
    });

    // First Event
    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const canaryReply = {
      channel: 'channel_id',
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(':double_vertical_bar: Canary has been paused')
        ),
        slackblocks.section(
          slackblocks.markdown(
            `The deployment pipeline has been paused due to detected issues in canary.
          Here are the steps you should follow to address the situation:\n\n
          :mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-us/20/deploy-canary/1/deploy-backend|Canary Logs>*.\n
          :sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
          :thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
          :arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
          :arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`
          )
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following 10 of 11 people who have commits in this deploy:\n<@U1230> <@U1231> <@U1232> <@U1233> <@U1234> <@U1235> <@U1236> <@U1237> <@U1238> <@U1239>`
          )
        ),
      ],
    };

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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject(canaryReply);
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_ENGINEERING_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
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
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);
    // The reply message is not updated
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

  it('post message to feed-deploy and not feed-engineering for failing checks', async function () {
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
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[0][0]).toMatchObject({
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

  function sortMessages(ao, bo) {
    const a = ao[0].channel;
    const b = bo[0].channel;
    if (a < b) {
      return 1;
    }
    if (a > b) {
      return -1;
    }
    return 0;
  }
});
