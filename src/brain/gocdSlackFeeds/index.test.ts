import merge from 'lodash.merge';

import oldPayload from '@test/payloads/gocd/gocd-stage-building.json';
import { MockedBolt, MockedGitHubAPI } from '@test/utils/testTypes';

import * as slackblocks from '@/blocks/slackBlocks';
import { buildServer } from '@/buildServer';
import {
  Color,
  DISCUSS_BACKEND_CHANNEL_ID,
  DISCUSS_ENG_SNS_CHANNEL_ID,
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
  GETSENTRY_ORG,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
} from '@/config';
import { Fastify, GoCDResponse } from '@/types';
import { getUser as nonMockedGetUser } from '@api/getUser';
import { bolt as originalBolt } from '@api/slack';
import { db } from '@utils/db';

import {
  GOCD_USER_GUIDE_LINK,
  gocdSlackFeeds,
  handler,
  IS_ROLLBACK_NECESSARY_LINK,
  ROLLBACK_PLAYBOOK_LINK,
} from '.';

jest.mock('@api/getUser');
const getUser = nonMockedGetUser as jest.Mock;

describe('gocdSlackFeeds', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG as unknown as { api: MockedGitHubAPI };
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
    await gocdSlackFeeds();
    await db('slack_messages').delete();
  });

  afterEach(async function () {
    fastify.close();
    jest.clearAllMocks();
    await db('slack_messages').delete();
  });

  it('post and update message to all feeds for canary failure', async function () {
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
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: getsentry-backend has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in canary. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/getsentry-backend/20/deploy-canary/1/deploy-backend|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/getsentry-backend|unpause the pipeline>* once it is safe to do so.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy, please triage using the above steps:\n<@U018H4DA8N5>`
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(canaryReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post and update message to all feeds for soak failure S4S', async function () {
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
          name: 'deploy-getsentry-backend-s4s',
          stage: {
            name: 'soak-time',
            result: 'Failed',
            jobs: [
              {
                name: 'soak',
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

    const soakReply = {
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: deploy-getsentry-backend-s4s has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in soak-time. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-s4s/20/soak-time/1/soak|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry-st.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1513938|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/deploy-getsentry-backend-s4s|unpause the pipeline>* once it is safe to do so.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy, please triage using the above steps:\n<@U018H4DA8N5>`
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
              slackblocks.markdown('*sentryio/deploy-getsentry-backend-s4s*')
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
                slackblocks.markdown('❌ *soak-time*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/deploy-getsentry-backend-s4s/20/soak-time/1|Failed>'
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(soakReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
          color: Color.SUCCESS,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/deploy-getsentry-backend-s4s*')
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
                slackblocks.markdown('✅ *soak-time*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/deploy-getsentry-backend-s4s/20/soak-time/1|Passed>'
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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post and update message to all feeds for soak failure SaaS', async function () {
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
            name: 'soak-time',
            result: 'Failed',
            jobs: [
              {
                name: 'soak',
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

    const soakReply = {
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: getsentry-backend has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in soak-time. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/getsentry-backend/20/soak-time/1/soak|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/getsentry-backend|unpause the pipeline>* once it is safe to do so.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy, please triage using the above steps:\n<@U018H4DA8N5>`
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
                slackblocks.markdown('❌ *soak-time*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/soak-time/1|Failed>'
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(soakReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
                slackblocks.markdown('✅ *soak-time*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/getsentry-backend/20/soak-time/1|Passed>'
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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('do not reply to canary if deploy-backend job did not fail', async function () {
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
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post and update message to all feeds without author for canary failure', async function () {
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
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: getsentry-backend has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in canary. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/getsentry-backend/20/deploy-canary/1/deploy-backend|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/getsentry-backend|unpause the pipeline>* once it is safe to do so.`)
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(canaryReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post and update message to all feeds with multiple authors for canary failure', async function () {
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
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: getsentry-backend has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in canary. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/getsentry-backend/20/deploy-canary/1/deploy-backend|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/getsentry-backend|unpause the pipeline>* once it is safe to do so.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following people who have commits in this deploy, please triage using the above steps:\n<@U1234> <@U12345> <@U123456>`
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(canaryReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(updateCalls[2][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    slackMessages = await db('slack_messages').select('*');
    expect(slackMessages).toHaveLength(3);
  });

  it('post and update message to all feeds with more than 10 authors for canary failure', async function () {
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
      channel: DISCUSS_BACKEND_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(
            ':double_vertical_bar: getsentry-backend has been paused'
          )
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has been paused due to detected issues in canary. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<https://deploy.getsentry.net/go/tab/build/detail/getsentry-backend/20/deploy-canary/1/deploy-backend|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<https://sentry.sentry.io/releases/backend@2b0034becc4ab26b985f4c1a08ab068f153c274c/?project=1|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to *<https://deploy.getsentry.net/go/pipeline/activity/getsentry-backend|unpause the pipeline>* once it is safe to do so.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following 10 of 11 people who have commits in this deploy, please triage using the above steps:\n<@U1230> <@U1231> <@U1232> <@U1233> <@U1234> <@U1235> <@U1236> <@U1237> <@U1238> <@U1239>`
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
    expect(postCalls[0][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(postCalls[1][0]).toMatchObject(canaryReply);
    expect(postCalls[2][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEPLOY_CHANNEL_ID })
    );
    expect(postCalls[3][0]).toMatchObject(
      merge({}, wantPostMsg, { channel: FEED_DEV_INFRA_CHANNEL_ID })
    );

    let slackMessages = await db('slack_messages').select('*');
    slackMessages.sort(sortMessages);
    expect(slackMessages).toHaveLength(3);

    const wantSlack = {
      refId: `sentryio-${gocdPayload.data.pipeline.name}/20@2b0034becc4ab26b985f4c1a08ab068f153c274c`,
      ts: '1234123.123',
      context: {
        text: 'GoCD deployment started',
      },
    };
    expect(slackMessages[0]).toMatchObject({
      ...wantSlack,
      channel: DISCUSS_BACKEND_CHANNEL_ID,
    });
    expect(slackMessages[1]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEPLOY_CHANNEL_ID,
    });
    expect(slackMessages[2]).toMatchObject({
      ...wantSlack,
      channel: FEED_DEV_INFRA_CHANNEL_ID,
    });

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
      merge({}, wantUpdate, { channel: DISCUSS_BACKEND_CHANNEL_ID })
    );
    expect(updateCalls[1][0]).toMatchObject(
      merge({}, wantUpdate, { channel: FEED_DEPLOY_CHANNEL_ID })
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

  it('post message to feed-deploy and not discuss-backend for failing checks', async function () {
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

  it('post message to discuss-eng-sns and feed-sns on snuba pipeline failure', async function () {
    const gocdPayload = merge({}, payload, {
      data: {
        pipeline: {
          name: 'deploy-snuba-us',
          stage: {
            name: 'deploy-canary',
            result: 'Failed',
            jobs: [
              {
                name: 'health_check',
                result: 'Failed',
              },
            ],
          },
        },
      },
    });
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
    org.api.repos.compareCommits.mockImplementation((_) => {
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

    await handler(gocdPayload);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);

    const pipelineFailureReply = {
      channel: DISCUSS_ENG_SNS_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext(':x: deploy-snuba-us has failed')
        ),
        slackblocks.section(
          slackblocks.markdown(`The deployment pipeline has failed due to detected issues in deploy-canary.\n
Please do not ignore this message just because the environment is not SaaS, because deployment to any subsequent environment will be cancelled.\n
*Review the errors* in the *<https://deploy.getsentry.net/go/tab/build/detail/deploy-snuba-us/20/deploy-canary/1/health_check|GoCD Logs>*.`)
        ),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the following 10 of 11 people who have commits in this deploy:\n<@U1230> <@U1231> <@U1232> <@U1233> <@U1234> <@U1235> <@U1236> <@U1237> <@U1238> <@U1239>`
          )
        ),
      ],
    };

    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);
    expect(postCalls[1][0]).toMatchObject(pipelineFailureReply);
  });

  it(`post message without a reply for run-custom-job when the stage result is unknown`, async function () {
    const gocdPayloadStarted = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            result: 'Unknown',
          },
        },
      },
    });

    // First Event
    await handler(gocdPayloadStarted);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(2);
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);

    expect(postCalls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
    expect(postCalls[1][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it(`post message without a reply for run-custom-job when the stage result is known`, async function () {
    const gocdPayloadSuccess = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'execute',
            result: 'Passed',
          },
        },
      },
    });

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
    await handler(gocdPayloadSuccess);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);

    expect(postCalls[0][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('✅ *execute*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/execute/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    });
    expect(postCalls[1][0]).toMatchObject({
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext('run-custom-job stage update')
        ),
        {
          elements: [
            slackblocks.markdown('✅ *execute*'),
            slackblocks.markdown(
              '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/execute/1|Passed>'
            ),
          ],
        },
      ],
    });
    expect(postCalls[2][0]).toMatchObject({
      text: 'GoCD deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.SUCCESS,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('✅ *execute*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/execute/1|Passed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it(`post message and reply for run-custom-job when there are stage updates`, async function () {
    getUser.mockImplementation((_) => {
      return { slackUser: 'GoCD_Slack_User' };
    });

    const gocdPayloadFailure = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            'approved-by': 'test@sentry.io',
            result: 'Failed',
          },
        },
      },
    });
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(0);
    await handler(gocdPayloadFailure);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    postCalls.sort(sortMessages);

    expect(postCalls[0][0]).toMatchObject({
      text: 'GoCD deployment started by <@GoCD_Slack_User>',
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|Failed>'
                ),
              ],
            },
          ],
        },
      ],
    });
    expect(postCalls[1][0]).toMatchObject({
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext('run-custom-job stage update')
        ),
        {
          elements: [
            slackblocks.markdown('❌ *checks*'),
            slackblocks.markdown(
              '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|Failed>'
            ),
          ],
        },
        slackblocks.divider(),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the user who started this deployment: <@GoCD_Slack_User>`
          )
        ),
      ],
    });
    expect(postCalls[2][0]).toMatchObject({
      text: 'GoCD deployment started by <@GoCD_Slack_User>',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.DANGER,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|Failed>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it(`post message and reply for run-custom-job when there are stage updates`, async function () {
    const gocdPayload1 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            result: 'Unknown',
          },
        },
      },
    });
    const gocdPayload2 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            result: 'Passed',
          },
        },
      },
    });
    const gocdPayload3 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'dry-run',
            result: 'Unknown',
          },
        },
      },
    });
    const gocdPayload4 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'dry-run',
            result: 'Failed',
          },
        },
      },
    });
    await handler(gocdPayload1);
    await handler(gocdPayload2);
    await handler(gocdPayload3);
    await handler(gocdPayload4);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(4);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(6);
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    const updateCalls = bolt.client.chat.update.mock.calls;
    postCalls.sort(sortMessages);
    updateCalls.sort(sortMessages);

    expect(postCalls[0][0]).toMatchObject({
      text: 'GoCD deployment started by <@GoCD_Slack_User>',
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
    expect(postCalls[1][0]).toMatchObject({
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext('run-custom-job stage update')
        ),
        {
          elements: [
            slackblocks.markdown('✅ *checks*'),
            slackblocks.markdown(
              '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|Passed>'
            ),
          ],
        },
        slackblocks.divider(),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the user who started this deployment: <@GoCD_Slack_User>`
          )
        ),
      ],
    });
    expect(postCalls[2][0]).toMatchObject({
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext('run-custom-job stage update')
        ),
        {
          elements: [
            slackblocks.markdown('❌ *dry-run*'),
            slackblocks.markdown(
              '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/dry-run/1|Failed>'
            ),
          ],
        },
        slackblocks.divider(),
        slackblocks.context(
          slackblocks.markdown(
            `cc'ing the user who started this deployment: <@GoCD_Slack_User>`
          )
        ),
      ],
    });
    expect(postCalls[3][0]).toMatchObject({
      text: 'GoCD deployment started by <@GoCD_Slack_User>',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  it(`post the correct message for run-custom-job when approved-by is not a Sentry email`, async function () {
    const gocdPayload1 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            'approved-by': 'changes',
            result: 'Unknown',
          },
        },
      },
    });
    const gocdPayload2 = merge({}, payload, {
      data: {
        pipeline: {
          name: 'run-custom-job',
          stage: {
            name: 'checks',
            'approved-by': 'changes',
            result: 'Passed',
          },
        },
      },
    });
    await handler(gocdPayload1);
    await handler(gocdPayload2);

    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(3);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(2);
    const postCalls = bolt.client.chat.postMessage.mock.calls;
    const updateCalls = bolt.client.chat.update.mock.calls;
    postCalls.sort(sortMessages);
    updateCalls.sort(sortMessages);

    expect(postCalls[0][0]).toMatchObject({
      text: 'GoCD auto-deployment started',
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
    expect(postCalls[1][0]).toMatchObject({
      channel: FEED_GOCD_JOB_RUNNER_CHANNEL_ID,
      text: '',
      blocks: [
        slackblocks.header(
          slackblocks.plaintext('run-custom-job stage update')
        ),
        {
          elements: [
            slackblocks.markdown('✅ *checks*'),
            slackblocks.markdown(
              '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|Passed>'
            ),
          ],
        },
      ],
    });
    expect(postCalls[2][0]).toMatchObject({
      text: 'GoCD auto-deployment started',
      channel: FEED_DEPLOY_CHANNEL_ID,
      attachments: [
        {
          color: Color.OFF_WHITE_TOO,
          blocks: [
            slackblocks.section(
              slackblocks.markdown('*sentryio/run-custom-job*')
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
                slackblocks.markdown('⏳ *checks*'),
                slackblocks.markdown(
                  '<https://deploy.getsentry.net/go/pipelines/run-custom-job/20/checks/1|In progress>'
                ),
              ],
            },
          ],
        },
      ],
    });
  });

  function sortMessages(ao, bo) {
    const aChannel = ao.channel ?? ao[0].channel;
    const bChannel = bo.channel ?? bo[0].channel;
    if (aChannel < bChannel) {
      return 1;
    }
    if (aChannel > bChannel) {
      return -1;
    }
    return 0;
  }
});
