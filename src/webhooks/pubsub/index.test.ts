import * as slackNotifications from './slackNotifications';
import * as staleBot from './stalebot';
import { pubSubHandler } from '.';

const mockNotifier = jest.fn();
const mockStaleBot = jest.fn();

slackNotifications.notifyProductOwnersForUntriagedIssues = mockNotifier;
staleBot.triggerStaleBot = mockStaleBot;

class MockReply {
  statusCode: number;
  code(c) {
    this.statusCode = c;
  }
  send() {}
}

describe('slack app', function () {
  let reply;

  async function pubSub(operationSlug: string) {
    const request = {
      body: {
        message: {
          data: new Buffer.from(
            JSON.stringify({ name: operationSlug })
          ).toString('base64'),
        },
      },
    };
    const reply = new MockReply();
    await pubSubHandler(request, reply);
    return reply;
  }

  beforeEach(async function () {
    mockNotifier.mockClear();
    mockStaleBot.mockClear();
  });

  it('basically works', async function () {
    const reply = await pubSub('stale-bot');
    expect(reply.statusCode).toBe(204);
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockStaleBot).toHaveBeenCalled();
  });

  it('keeps working', async function () {
    const reply = await pubSub('stale-triage-notifier');
    expect(reply.statusCode).toBe(204);
    expect(mockNotifier).toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });

  it('replies with 400 for unknown operations', async function () {
    const reply = await pubSub('cheez-whiz');
    expect(reply.statusCode).toBe(400);
    expect(mockNotifier).not.toHaveBeenCalled();
    expect(mockStaleBot).not.toHaveBeenCalled();
  });
});
