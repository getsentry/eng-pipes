import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { PRODUCT_OWNERS_INFO } from '@/config';
import { getTeams } from '@/utils/github/getTeams';
import { isTimeInBusinessHours } from '@utils/businessHours';

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
      const offices = PRODUCT_OWNERS_INFO['teams'][team]['offices'] || ['sfo'];
      const channel = PRODUCT_OWNERS_INFO['teams'][team]['slack_channel'];
      if (!channel) {
        Sentry.captureMessage(`Could not find channel for ${team} in config`);
        return acc;
      }
      acc.push({
        channelId: PRODUCT_OWNERS_INFO['teams'][team]['slack_channel'],
        isChannelInBusinessHours: offices
          .map((office: any) => isTimeInBusinessHours(now, office))
          .includes(true),
      });
      return acc;
    },
    []
  );
  return channels;
};
