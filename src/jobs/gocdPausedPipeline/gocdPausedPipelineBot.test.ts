import { OAuth2Client } from 'google-auth-library';
import moment from 'moment-timezone';

import { GETSENTRY_ORG } from '@/config';
import { GoCDDashboardResponse } from '@/types/gocd';

import * as gocdAPI from '../../api/gocd/index';
import { bolt } from '../../api/slack/__mocks__';

import { triggerPausedPipelineBot } from './gocdPausedPipelineBot';

const NOW = moment('2024-01-01T00:00:00Z');

jest.mock('@/config', () => {
  const actualEnvVariables = jest.requireActual('@/config');
  return {
    ...actualEnvVariables,
    GOCD_PAUSED_PIPELINE_REMINDERS: [
      {
        pipelineName: 'deploy-test',
        notifyAfter: moment.duration(1, 'hour'),
        slackChannel: 'test',
      },
      {
        pipelineName: 'deploy-prod',
        notifyAfter: moment.duration(1, 'hour'),
        slackChannel: 'test',
      },
    ],
  };
});

describe('GoCD Paused Pipeline Notifications', function () {
  let postMessageSpy: jest.SpyInstance;
  beforeAll(() => {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(jest.fn());
    postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
  });

  afterEach(() => {
    postMessageSpy.mockClear();
  });

  it('should not send a message if org is not getsentry', async () => {
    await triggerPausedPipelineBot({} as any, NOW);
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });

  it('should not send a message if fetchDashboard fails', async () => {
    jest.spyOn(gocdAPI, 'fetchDashboard').mockImplementation(() => {
      return Promise.reject('error');
    });
    await triggerPausedPipelineBot(GETSENTRY_ORG, NOW);
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });

  it('should not send a message to slack if a pipeline is not paused', async () => {
    jest.spyOn(gocdAPI, 'fetchDashboard').mockImplementation(() => {
      return Promise.resolve({
        pipelines: [
          {
            name: 'deploy-test',
            pause_info: {
              paused: false,
            },
          },
        ],
      } as GoCDDashboardResponse);
    });
    await triggerPausedPipelineBot(GETSENTRY_ORG, NOW);
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });

  it('should send a message to slack if a pipeline is paused', async () => {
    jest.spyOn(gocdAPI, 'fetchDashboard').mockImplementation(() => {
      return Promise.resolve({
        pipelines: [
          {
            name: 'deploy-test',
            pause_info: {
              paused: true,
              paused_at: NOW.clone().subtract(2, 'hours').toISOString(),
            },
          },
        ],
      } as GoCDDashboardResponse);
    });
    await triggerPausedPipelineBot(GETSENTRY_ORG, NOW);
    expect(postMessageSpy).toBeCalledWith({
      channel: 'test',
      text: 'A pipeline has been paused for an extended period of time. If this is unintentional, please look into unpausing it if it is safe to do so.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'A pipeline has been paused for an extended period of time. If this is unintentional, please look into unpausing it if it is safe to do so.',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: *<https://deploy.getsentry.net/go/tab/pipeline/history/deploy-test|deploy-test>*: has been paused for 2 hours',
          },
        },
      ],
    });
  });

  it('should not send a message to slack if the pipeline has not been paused long enough', async () => {
    jest.spyOn(gocdAPI, 'fetchDashboard').mockImplementation(() => {
      return Promise.resolve({
        pipelines: [
          {
            name: 'deploy-test',
            pause_info: {
              paused: true,
              paused_at: NOW.clone().subtract(30, 'minutes').toISOString(),
            },
          },
        ],
      } as GoCDDashboardResponse);
    });
    await triggerPausedPipelineBot(GETSENTRY_ORG, NOW);
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });

  it('should send a message if multiple pipelines are paused', async () => {
    jest.spyOn(gocdAPI, 'fetchDashboard').mockImplementation(() => {
      return Promise.resolve({
        pipelines: [
          {
            name: 'deploy-test',
            pause_info: {
              paused: true,
              paused_at: NOW.clone().subtract(2, 'hours').toISOString(),
            },
          },
          {
            name: 'deploy-prod',
            pause_info: {
              paused: true,
              paused_at: NOW.clone().subtract(2, 'hours').toISOString(),
            },
          },
        ],
      } as GoCDDashboardResponse);
    });
    await triggerPausedPipelineBot(GETSENTRY_ORG, NOW);
    expect(postMessageSpy).toBeCalledWith({
      channel: 'test',
      text: 'Multiple pipelines have been paused for an extended period of time. If this is unintentional, please look into unpausing them if it is safe to do so.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Multiple pipelines have been paused for an extended period of time. If this is unintentional, please look into unpausing them if it is safe to do so.',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: *<https://deploy.getsentry.net/go/tab/pipeline/history/deploy-test|deploy-test>*: has been paused for 2 hours\n:warning: *<https://deploy.getsentry.net/go/tab/pipeline/history/deploy-prod|deploy-prod>*: has been paused for 2 hours',
          },
        },
      ],
    });
  });
});
