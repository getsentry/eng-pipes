import fs from 'fs';

import yaml from 'js-yaml';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import {
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  OFFICE_TIME_ZONES,
  PRODUCT_AREA_LABEL_PREFIX,
  PRODUCT_OWNERS_INFO,
  TEAM_OSPO_CHANNEL_ID,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { bolt } from '@api/slack';

import { getTeams } from './getTeams';

const officesCache = {};
const HOUR_IN_MS = 60 * 60 * 1000;
const BUSINESS_DAY_IN_MS = 8 * HOUR_IN_MS;

const holidayFile = fs.readFileSync('holidays.yml');
const HOLIDAY_CONFIG = yaml.load(holidayFile);
interface BusinessHourWindow {
  start: moment.Moment;
  end: moment.Moment;
}

export async function calculateTimeToRespondBy(
  numDays: number,
  productArea: string,
  repo: string,
  org: string,
  testTimestamp?: string
) {
  let cursor =
    testTimestamp !== undefined ? moment(testTimestamp).utc() : moment().utc();
  let msRemaining = numDays * BUSINESS_DAY_IN_MS;
  while (msRemaining > 0) {
    const nextBusinessHours = await getNextAvailableBusinessHourWindow(
      productArea,
      cursor,
      repo,
      org
    );
    const { start, end }: BusinessHourWindow = nextBusinessHours;
    cursor = start;
    const msAvailable = end.valueOf() - start.valueOf();
    const msToAdd = Math.min(msAvailable, msRemaining);
    cursor.add(msToAdd, 'milliseconds');
    msRemaining -= msToAdd;
  }
  return cursor.toISOString();
}

export async function calculateSLOViolationTriage(
  target_name: string,
  labels: any,
  repo: string,
  org: string
) {
  // calculate time to triage for issues that come in with untriaged label
  if (target_name === WAITING_FOR_PRODUCT_OWNER_LABEL) {
    const productArea = labels?.find((label) =>
      label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX)
    )?.name;
    return calculateTimeToRespondBy(MAX_TRIAGE_DAYS, productArea, repo, org);
  }
  // calculate time to triage for issues that are rerouted
  else if (
    target_name.startsWith(PRODUCT_AREA_LABEL_PREFIX) &&
    labels?.some((label) => label.name === WAITING_FOR_PRODUCT_OWNER_LABEL)
  ) {
    return calculateTimeToRespondBy(MAX_TRIAGE_DAYS, target_name, repo, org);
  }
  return null;
}

export async function calculateSLOViolationRoute(
  target_name: string,
  repo: string,
  org: string
) {
  if (target_name === WAITING_FOR_SUPPORT_LABEL) {
    return calculateTimeToRespondBy(
      MAX_ROUTE_DAYS,
      'Product Area: Unknown',
      repo,
      org
    );
  }
  return null;
}

export async function cacheOffices(productArea) {
  const offices = [
    ...new Set(
      (
        await getLabelsTable()
          .where({
            label_name: productArea,
          })
          .select('offices')
      )
        .reduce((acc, item) => acc.concat(item.offices), [])
        .filter((office) => office != null)
    ),
  ];
  officesCache[productArea] = offices;
  return offices;
}

export const isTimeInBusinessHours = (time: moment.Moment, office: string) => {
  const localTime = time.tz(OFFICE_TIME_ZONES[office]);
  const date = localTime.format('YYYY-MM-DD');
  const dayOfTheWeek = localTime.day();
  const isWeekend = dayOfTheWeek === 6 || dayOfTheWeek === 0;
  const isHoliday = HOLIDAY_CONFIG[office]?.dates.includes(date);
  if (!isWeekend && !isHoliday) {
    const start = moment
      .tz(`${date} 09:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
      .utc();
    const end = moment
      .tz(`${date} 17:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
      .utc();
    return start <= localTime && localTime <= end;
  }
  return false;
};

export const isChannelInBusinessHours = async (
  channelId: string,
  now: moment.Moment
) => {
  // find all offices channel is subscribed to
  let offices = [
    ...new Set(
      (
        await getLabelsTable()
          .where({
            channel_id: channelId,
          })
          .select('offices')
      )
        .reduce((acc, item) => acc.concat(item.offices), [])
        .filter((office) => office != null)
    ),
  ];

  // If no offices are found for the channel, backfill this with sfo
  if (offices.length === 0) {
    // @ts-expect-error
    const channelName = (
      await bolt.client.conversations.info({ channel: channelId })
    ).channel?.name;
    await bolt.client.chat.postMessage({
      text: `Hey OSPO, looks like #${channelName} doesn't have offices set.`,
      channel: TEAM_OSPO_CHANNEL_ID,
    });
    offices = ['sfo'];
  }

  // for all offices, check if the current time is in business hours
  return offices
    .map((office: any) => isTimeInBusinessHours(now, office))
    .includes(true);
};

export async function getNextAvailableBusinessHourWindow(
  productArea: string,
  momentTime: moment.Moment,
  repo: string,
  org: string
): Promise<BusinessHourWindow> {
  let offices: Set<string> = new Set<string>();
  const teams = getTeams(repo, org, productArea);
  // TODO(getsentry/team-ospo#200): Add codecov support
  if (org !== 'codecov') {
    offices = teams.reduce((acc, team) => {
      if (PRODUCT_OWNERS_INFO['teams'][team]['offices']) {
        PRODUCT_OWNERS_INFO['teams'][team]['offices'].forEach((office) => {
          acc.add(office);
        });
      }
      return acc;
    }, new Set<string>());
  }
  if (!offices.size) {
    offices = new Set<string>().add('sfo');
  }
  const businessHourWindows: BusinessHourWindow[] = [];
  ([...offices] || ['sfo']).forEach((office) => {
    const momentIterator = moment(momentTime.valueOf()).utc();
    let isWeekend,
      dayOfTheWeek,
      date,
      isHoliday,
      isTimestampOutsideBusinessHourWindow,
      end;
    do {
      dayOfTheWeek = momentIterator.tz(OFFICE_TIME_ZONES[office]).day();
      // Saturday is 6, Sunday is 0
      isWeekend = dayOfTheWeek === 6 || dayOfTheWeek === 0;
      date = momentIterator.tz(OFFICE_TIME_ZONES[office]).format('YYYY-MM-DD');
      end = moment
        .tz(`${date} 17:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
        .utc();
      isTimestampOutsideBusinessHourWindow = momentTime >= end;
      isHoliday = HOLIDAY_CONFIG[office]?.dates.includes(date);
      momentIterator.add(1, 'days');
      /*
      We want to iterate until we find the first business hours for each office.
      Three cases to consider here before incrementing the momentIterator obj
      1. momentIterator date is a holiday
      2. momentIterator date is a weekend
      3. business hours for an office on momentIterator date has passed by
    */
    } while (isHoliday || isWeekend || isTimestampOutsideBusinessHourWindow);
    // Start window will be the max of the start of the workday or the moment time passed in
    const start = moment.max(
      moment
        .tz(`${date} 09:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
        .utc(),
      momentTime
    );
    businessHourWindows.push({
      start,
      end,
    });
  });
  // Sort the business hours by the starting date, we only care about the closest business hour window
  businessHourWindows.sort((a: any, b: any) => a.start - b.start);
  return businessHourWindows[0];
}

export async function getOffices(productArea: string) {
  if (!productArea) {
    return [];
  }
  if (!officesCache[productArea]) {
    await cacheOffices(productArea);
  }
  return officesCache[productArea];
}
