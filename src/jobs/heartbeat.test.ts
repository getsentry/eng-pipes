import moment from 'moment-timezone';

import { DATADOG_API_INSTANCE } from '@/config';

import { callDatadog } from './heartbeat';

describe('test uptime heartbeat', function () {
  let datadogApiInstanceSpy;
  beforeEach(() => {
    datadogApiInstanceSpy = jest
      .spyOn(DATADOG_API_INSTANCE, 'createEvent')
      .mockImplementation(jest.fn());
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('should send a message to slack', async () => {
    const timestamp = moment().unix();
    await callDatadog(timestamp);
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);
    const message = datadogApiInstanceSpy.mock.calls[0][0];
    expect(message).toEqual({
      body: {
        title: 'Infra Hub Update',
        text: 'Infra Hub is up',
        dateHappened: timestamp,
        alertType: 'error',
        tags: [
          `source_tool:infra-hub`,
          `source:infra-hub`,
          `source_category:infra-tools`,
          `sentry_user:infra-hub`,
        ],
      },
    });
  });
});
