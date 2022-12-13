import fs from 'fs';

import yaml from 'js-yaml';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import {
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  OFFICE_TIME_ZONES,
  TEAM_LABEL_PREFIX,
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
} from '@/config';

const HOUR_IN_MS = 60 * 60 * 1000;
const BUSINESS_DAY_IN_MS = 8 * HOUR_IN_MS;

const holidayFile = fs.readFileSync('holidays.yml');
const HOLIDAY_CONFIG = yaml.load(holidayFile);

const officeHourOrdering: Record<string, number> = {
  vie: 1,
  ams: 2,
  yyz: 3,
  sfo: 4,
  sea: 5,
};
const officesCache = {};

export async function calculateTimeToRespondBy(numDays, timestamp, team) {
  let cursor = moment(timestamp);
  let msRemaining = numDays * BUSINESS_DAY_IN_MS;
  while (msRemaining > 0) {
    // Slicing ISO string gives us just the YYYY-MM-DD
    const businessHoursPerOffice = await getBusinessHoursForTeam(
      team,
      cursor.toISOString()
    );
    businessHoursPerOffice.forEach(({ start, end }) => {
      if (msRemaining <= 0) {
        return;
      }
      /*
        If current cursor time is less than start of business hours, we need to set it to the start.
        We'll use up the minimum of the 8 business hour window or the time left until violation.
      */
      if (cursor < start) {
        cursor = moment(start);
        const msToAdd = Math.min(BUSINESS_DAY_IN_MS, msRemaining);
        cursor.add(msToAdd, 'milliseconds');
        msRemaining -= msToAdd;
        /*
         If current cursor time is >= start of business hours, we will find the max hours we can get
         out of the window of business hours.
      */
      } else if (cursor >= start && cursor < end) {
        const msAvailable = end.valueOf() - cursor.valueOf();
        const msToAdd = Math.min(msAvailable, msRemaining);
        cursor.add(msToAdd, 'milliseconds');
        msRemaining -= msToAdd;
      }
    });
    /*
      Here, I'm incrementing the cursor by an hour until the business hours for a team changes. Since
      we're dealing with different timezones, we can't just increment by an entire day. This will always discover
      the next business hours window 9 hours before.
    */
    while (
      msRemaining > 0 &&
      JSON.stringify(businessHoursPerOffice) ===
        JSON.stringify(
          await getBusinessHoursForTeam(team, cursor.toISOString())
        )
    ) {
      cursor.add(HOUR_IN_MS, 'milliseconds');
    }
  }
  return cursor.toISOString();
}

export async function calculateSLOViolationTriage(
  target_name,
  timestamp,
  labels
) {
  // calculate time to triage for issues that come in with untriaged label
  if (target_name === UNTRIAGED_LABEL) {
    const team = labels?.find((label) =>
      label.name.startsWith(TEAM_LABEL_PREFIX)
    )?.name;
    return calculateTimeToRespondBy(MAX_TRIAGE_DAYS, timestamp, team);
  }
  // calculate time to triage for issues that are rerouted
  else if (
    target_name.startsWith(TEAM_LABEL_PREFIX) &&
    labels?.some((label) => label.name === UNTRIAGED_LABEL)
  ) {
    return calculateTimeToRespondBy(MAX_TRIAGE_DAYS, timestamp, target_name);
  }
  return null;
}

export async function calculateSLOViolationRoute(target_name, timestamp) {
  if (target_name === UNROUTED_LABEL) {
    return calculateTimeToRespondBy(MAX_ROUTE_DAYS, timestamp, 'Team: Support');
  }
  return null;
}

export async function cacheOfficesForTeam(team) {
  const officesSet = new Set(
    (
      await getLabelsTable()
        .where({
          label_name: team,
        })
        .select('offices')
    )
      .reduce((acc, item) => acc.concat(item.offices), [])
      .filter((office) => office != null)
  );
  // Sorting from which office timezone comes earlier in the day in UTC, makes calculations easier later on
  const orderedOffices = [...officesSet].sort(
    (a: any, b: any) => officeHourOrdering[a] - officeHourOrdering[b]
  );
  officesCache[team] = orderedOffices;
  return orderedOffices;
}

export async function getBusinessHoursForTeam(team, timestamp) {
  let offices = await getOfficesForTeam(team);
  if (offices.length === 0) {
    offices = await getOfficesForTeam('Team: Open Source');
    if (offices.length === 0) {
      throw new Error('Open Source team not subscribed to any offices.');
    }
  }
  const hours: { start; end }[] = [];
  /*
    Using moment timezone to deal with daylight savings instead of hardcoding UTC hours.
    If offices is empty, then we default to sfo office
  */
  offices.forEach((office) => {
    const dayOfTheWeek = moment(timestamp).tz(OFFICE_TIME_ZONES[office]).day();
    // Saturday is 6, Sunday is 0
    const isWeekend = dayOfTheWeek === 6 || dayOfTheWeek === 0;
    const date = moment(timestamp)
      .tz(OFFICE_TIME_ZONES[office])
      .format('YYYY-MM-DD');
    if (!HOLIDAY_CONFIG[office]?.dates.includes(date) && !isWeekend) {
      hours.push({
        start: moment.tz(
          `${date} 09:00`,
          'YYYY-MM-DD hh:mm',
          OFFICE_TIME_ZONES[office]
        ),
        end: moment.tz(
          `${date} 17:00`,
          'YYYY-MM-DD hh:mm',
          OFFICE_TIME_ZONES[office]
        ),
      });
    }
  });
  return hours;
}

export async function getOfficesForTeam(team) {
  if (!team) {
    return [];
  }
  if (!officesCache[team]) {
    await cacheOfficesForTeam(team);
  }
  return officesCache[team];
}
