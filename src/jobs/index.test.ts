import { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';

import * as gocdPausedPipelineBot from './gocdPausedPipelineBot';
import * as slackNotifications from './slackNotifications';
import * as slackScores from './slackScores';
import * as staleBot from './stalebot';
import { pubSubHandler } from '.';

const mockGocdPausedPipelineBot = jest.fn();
const mockNotifier = jest.fn();
const mockSlackScores = jest.fn();
const mockStaleBot = jest.fn();

jest
  .spyOn(gocdPausedPipelineBot, 'triggerPausedPipelineBot')
  .mockImplementation(mockGocdPausedPipelineBot);
jest
  .spyOn(slackNotifications, 'notifyProductOwnersForUntriagedIssues')
  .mockImplementation(mockNotifier);
jest
  .spyOn(slackScores, 'triggerSlackScores')
  .mockImplementation(mockSlackScores);
jest.spyOn(staleBot, 'triggerStaleBot').mockImplementation(mockStaleBot);

class MockReply {
  statusCode: number = 0;
  code(c) {
    this.statusCode = c;
  }
  send() {}
}

describe('slack app', function () {
  async function pubSub(operationSlug: string): Promise<MockReply> {
    const request = {
      body: {
        message: {
          data: Buffer.from(JSON.stringify({ name: operationSlug })).toString(
            'base64'
          ),
        },
      },
      headers: {
        authorization: 'Bearer 1234abcd',
      },
    } as FastifyRequest<{ Body: { message: { data: string } } }>;
    const reply = new MockReply() as FastifyReply;
    await pubSubHandler(request, reply);
    return reply;
  }

  beforeAll(function () {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(jest.fn());
  });

  beforeEach(async function () {
    mockGocdPausedPipelineBot.mockClear();
    mockNotifier.mockClear();
    mockSlackScores.mockClear();
    mockStaleBot.mockClear();
  });

  it('basically works', async function () {
    const reply = await pubSub('stale-bot');
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).toHaveBeenCalled();
  });

  it('keeps working', async function () {
    const reply = await pubSub('stale-triage-notifier');
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('works for slack-scores', async function () {
    const reply = await pubSub('slack-scores');
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('works for gocd-paused-pipeline-bot', async function () {
    const reply = await pubSub('gocd-paused-pipeline-bot');
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('replies with 400 for unknown operations', async function () {
    const reply = await pubSub('cheez-whiz');
    expect(reply.statusCode).toBe(400);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('replies with 400 for missing auth', async function () {
    const request = {
      body: {
        message: {
          data: Buffer.from(JSON.stringify({ name: 'stale-bot' })).toString(
            'base64'
          ),
        },
      },
      headers: {},
    } as FastifyRequest<{ Body: { message: { data: string } } }>;
    const reply = new MockReply() as FastifyReply;
    await pubSubHandler(request, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('replies with 400 for invalid auth', async function () {
    const request = {
      body: {
        message: {
          data: Buffer.from(JSON.stringify({ name: 'stale-bot' })).toString(
            'base64'
          ),
        },
      },
      headers: {
        authorization: 'invalid',
      },
    } as FastifyRequest<{ Body: { message: { data: string } } }>;
    const reply = new MockReply() as FastifyReply;
    await pubSubHandler(request, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('replies with 401 for invalid token', async function () {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementationOnce(() => {
        throw new Error('test');
      });
    const reply = await pubSub('stale-bot');
    expect(reply.statusCode).toBe(401);
  });
});
