import { bolt } from '@/api/slack';

import { heartbeat } from './heartbeat';

describe('test uptime heartbeat', function () {
  let postMessageSpy;
  beforeEach(() => {
    postMessageSpy = jest
      .spyOn(bolt.client.chat, 'postMessage')
      .mockImplementation(jest.fn());
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('should send a message to slack', async () => {
    await heartbeat();
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Infra Hub is up',
      })
    );
  });
});
