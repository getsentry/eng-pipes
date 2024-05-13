import moment from 'moment-timezone';

import { PRODUCT_OWNERS_INFO } from '@/config';
import { isTimeInBusinessHours } from '@utils/businessHours';
import { getTeams } from '@utils/getTeams';

export type ChannelItem = {
  channelId: string;
  isChannelInBusinessHours: boolean;
};

export const getChannelsForIssue = (
  repo: string,
  org: string,
  productArea: string,
  now: moment.Moment
): ChannelItem[] => {
  const teams = getTeams(repo, org, productArea);
  if (!teams.length) {
    return [];
  }
  const channels: ChannelItem[] = teams.reduce(
    (acc: ChannelItem[], team: string) => {
      const offices = PRODUCT_OWNERS_INFO['teams'][team]['offices'];
      acc.push({
        channelId: PRODUCT_OWNERS_INFO['teams'][team]['slack_channel'],
        isChannelInBusinessHours: (offices || ['sfo'])
          .map((office: any) => isTimeInBusinessHours(now, office))
          .includes(true),
      });
      return acc;
    },
    []
  );
  return channels;
};
