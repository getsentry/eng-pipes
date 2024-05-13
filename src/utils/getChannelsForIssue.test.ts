import moment from 'moment-timezone';

import { getChannelsForIssue } from '@utils/getChannelsForIssue';

describe('getChannelsForIssue', () => {
  it('will get channel info for repo without routing', () => {
    expect(
      getChannelsForIssue(
        'test-ttt-simple',
        'getsentry',
        '',
        moment('2022-12-12T17:00:00.000Z')
      )
    ).toEqual([{ channelId: 'C05A6BW303Z', isChannelInBusinessHours: true }]);
  });
  it('will get channel info for repo with routing', () => {
    expect(
      getChannelsForIssue(
        'routing-repo',
        'getsentry',
        'Multi-Team',
        moment('2022-12-14T00:00:00.000Z')
      )
    ).toEqual([
      {
        channelId: 'C05A6BW303Z',
        isChannelInBusinessHours: true,
      },
      {
        channelId: 'C05A6BW303B',
        isChannelInBusinessHours: false,
      },
    ]);
  });
  it('will return team-ospo channel if inputs are invalid', () => {
    expect(
      getChannelsForIssue(
        'garbage-repo',
        'getsentry',
        '',
        moment('2022-12-12T17:00:00.000Z')
      )
    ).toEqual([{ channelId: 'C05A6BW303Y', isChannelInBusinessHours: true }]);
  });
});
