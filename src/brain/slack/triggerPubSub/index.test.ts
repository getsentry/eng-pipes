import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import * as slackScoresFunctions from '@/jobs/slackScores';

import { TEAM_OSPO_CHANNEL_ID } from '../../../config';

import { triggerPubSub } from '.';

jest.mock('@api/slack');

describe('slack app', function () {
  let fastify, sendGitHubEngagementMetricsSpy, sendGitHubActivityMetricsSpy;

  beforeEach(async function () {
    fastify = await buildServer(false);
    sendGitHubEngagementMetricsSpy = jest.spyOn(
      slackScoresFunctions,
      'sendGitHubEngagementMetrics'
    );
    sendGitHubActivityMetricsSpy = jest.spyOn(
      slackScoresFunctions,
      'sendGitHubActivityMetrics'
    );
    triggerPubSub();
  });

  afterEach(function () {
    fastify.close();
    jest.clearAllMocks();
  });

  it('does not do anything if channel is not ospo team channel', async function () {
    const response = await createSlackAppMention(
      fastify,
      '<@U018UAXJVG8> ttr',
      'channel1'
    );
    expect(response.statusCode).toBe(200);
    expect(sendGitHubEngagementMetricsSpy).not.toHaveBeenCalled();
    expect(sendGitHubActivityMetricsSpy).not.toHaveBeenCalled();
  });

  it('fetches github ttr', async function () {
    const response = await createSlackAppMention(
      fastify,
      '<@U018UAXJVG8> ttr',
      TEAM_OSPO_CHANNEL_ID
    );
    expect(response.statusCode).toBe(200);
    expect(sendGitHubEngagementMetricsSpy).toHaveBeenCalledWith(true);
    expect(sendGitHubActivityMetricsSpy).not.toHaveBeenCalled();
  });

  it('fetches github activity', async function () {
    const response = await createSlackAppMention(
      fastify,
      '<@U018UAXJVG8> activity',
      TEAM_OSPO_CHANNEL_ID
    );
    expect(response.statusCode).toBe(200);
    expect(sendGitHubEngagementMetricsSpy).not.toHaveBeenCalled();
    expect(sendGitHubActivityMetricsSpy).toHaveBeenCalledWith(true);
  });
});
