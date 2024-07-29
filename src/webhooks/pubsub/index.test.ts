// import * as gocdPausedPipelineBot from './gocdPausedPipelineBot';
// import * as slackNotifications from './slackNotifications';
// import * as slackScores from './slackScores';
// import * as staleBot from './stalebot';
// import { pubSubHandler } from '.';

// const mockGocdPausedPipelineBot = jest.fn();
// const mockNotifier = jest.fn();
// const mockSlackScores = jest.fn();
// const mockStaleBot = jest.fn();

// gocdPausedPipelineBot.triggerPausedPipelineBot = mockGocdPausedPipelineBot;
// slackNotifications.notifyProductOwnersForUntriagedIssues = mockNotifier;
// slackScores.triggerSlackScores = mockSlackScores;
// staleBot.triggerStaleBot = mockStaleBot;

// class MockReply {
//   statusCode: number;
//   code(c) {
//     this.statusCode = c;
//   }
//   send() {}
// }

describe('slack app', function () {
  it('noop', () => {});
  // async function pubSub(operationSlug: string) {
  //   const request = {
  //     body: {
  //       message: {
  //         data: new Buffer.from(
  //           JSON.stringify({ name: operationSlug })
  //         ).toString('base64'),
  //       },
  //     },
  //   };
  //   const reply = new MockReply();
  //   await pubSubHandler(request, reply);
  //   return reply;
  // }

  // beforeEach(async function () {
  //   mockGocdPausedPipelineBot.mockClear();
  //   mockNotifier.mockClear();
  //   mockSlackScores.mockClear();
  //   mockStaleBot.mockClear();
  // });

  // it('basically works', async function () {
  //   const reply = await pubSub('stale-bot');
  //   expect(reply.statusCode).toBe(204);
  //   expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
  //   expect(mockNotifier).not.toHaveBeenCalled();
  //   expect(mockSlackScores).not.toHaveBeenCalled();
  //   expect(mockStaleBot).toHaveBeenCalled();
  // });

  // it('keeps working', async function () {
  //   const reply = await pubSub('stale-triage-notifier');
  //   expect(reply.statusCode).toBe(204);
  //   expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
  //   expect(mockNotifier).toHaveBeenCalled();
  //   expect(mockSlackScores).not.toHaveBeenCalled();
  //   expect(mockStaleBot).not.toHaveBeenCalled();
  // });

  // it('works for slack-scores', async function () {
  //   const reply = await pubSub('slack-scores');
  //   expect(reply.statusCode).toBe(204);
  //   expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
  //   expect(mockNotifier).not.toHaveBeenCalled();
  //   expect(mockSlackScores).toHaveBeenCalled();
  //   expect(mockStaleBot).not.toHaveBeenCalled();
  // });

  // it('works for gocd-paused-pipeline-bot', async function () {
  //   const reply = await pubSub('gocd-paused-pipeline-bot');
  //   expect(reply.statusCode).toBe(204);
  //   expect(mockGocdPausedPipelineBot).toHaveBeenCalled();
  //   expect(mockNotifier).not.toHaveBeenCalled();
  //   expect(mockSlackScores).not.toHaveBeenCalled();
  //   expect(mockStaleBot).not.toHaveBeenCalled();
  // });

  // it('replies with 400 for unknown operations', async function () {
  //   const reply = await pubSub('cheez-whiz');
  //   expect(reply.statusCode).toBe(400);
  //   expect(mockGocdPausedPipelineBot).not.toHaveBeenCalled();
  //   expect(mockNotifier).not.toHaveBeenCalled();
  //   expect(mockSlackScores).not.toHaveBeenCalled();
  //   expect(mockStaleBot).not.toHaveBeenCalled();
  // });
});
