import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { OAuth2Client } from 'google-auth-library';

import * as gocdPausedPipelineBot from './gocdPausedPipeline/gocdPausedPipelineBot';
import { triggerPausedPipelineBot } from './gocdPausedPipeline/gocdPausedPipelineBot';
import * as slackScores from './slackScores/slackScores';
import { triggerSlackScores } from './slackScores/slackScores';
import * as staleBot from './staleBot/stalebot';
import { triggerStaleBot } from './staleBot/stalebot';
import * as slackNotifications from './staleTriageNotifier/slackNotifications';
import { notifyProductOwnersForUntriagedIssues } from './staleTriageNotifier/slackNotifications';
import { handleGithubJobs, routeJobs } from '.';

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
function mapOperation(operation: string) {
  return new Map([
    ['stale-triage-notifier', notifyProductOwnersForUntriagedIssues],
    ['stale-bot', triggerStaleBot],
    ['slack-scores', triggerSlackScores],
    ['gocd-paused-pipeline-bot', triggerPausedPipelineBot],
  ]).get(operation);
}

describe('cron jobs testing', function () {
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
    await handleGithubJobs(mapOperation(operationSlug), request, reply);
    return reply;
  }
  let server: FastifyInstance;

  beforeAll(function () {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(jest.fn());
  });

  beforeEach(async function () {
    server = fastify();
    server.register(routeJobs, { prefix: '/jobs' });
    mockGocdPausedPipelineBot.mockClear();
    mockNotifier.mockClear();
    mockSlackScores.mockClear();
    mockStaleBot.mockClear();
  });

  afterEach(() => {
    server.close();
    jest.clearAllMocks();
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
    await handleGithubJobs(mapOperation('stale-bot'), request, reply);
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
    await handleGithubJobs(mapOperation('stale-bot'), request, reply);
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

  it('POST /stale-triage-notifier should call notifyProductOwnersForUntriagedIssues', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/jobs/stale-triage-notifier',
      headers: {
        authorization: 'Bearer 1234abcd',
      },
    });
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('POST /stale-bot should call triggerStaleBot', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/jobs/stale-bot',
      headers: {
        authorization: 'Bearer 1234abcd',
      },
    });

    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).toHaveBeenCalled();
  });

  it('POST /slack-scores should call triggerSlackScores', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/jobs/slack-scores',
      headers: {
        authorization: 'Bearer 1234abcd',
      },
    });
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('POST /gocd-paused-pipeline-bot should call triggerPausedPipelineBot', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/jobs/gocd-paused-pipeline-bot',
      headers: {
        authorization: 'Bearer 1234abcd',
      },
    });
    expect(reply.statusCode).toBe(204);
    expect(mockGocdPausedPipelineBot).toHaveBeenCalled();
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockSlackScores).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });
});
