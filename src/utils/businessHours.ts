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
const DAY_IN_MS = 24 * HOUR_IN_MS;

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
  const cursor = new Date(timestamp);
  let msRemaining = numDays * BUSINESS_DAY_IN_MS;
  while (msRemaining > 0) {
    // Slicing ISO string gives us just the YYYY-MM-DD
    const startingDate = cursor.toISOString().slice(0, 10);
    const officeHoursPerOffice = await getBusinessHoursForTeam(
      team,
      startingDate
    );
    officeHoursPerOffice.forEach((timePeriod) => {
      const { start, end } = timePeriod;
      /*
        If current cursor time is less than start of business hours, we need to set it to the start.
        We'll use up the minimum of the 8 business hour window or the time left until violation.
      */
      if (cursor.getTime() < start.getTime() && msRemaining > 0) {
        cursor.setTime(start.getTime());
        const msToAdd = Math.min(BUSINESS_DAY_IN_MS, msRemaining);
        cursor.setTime(cursor.getTime() + msToAdd);
        msRemaining -= msToAdd;
        /*
         If current cursor time is >= start of business hours, we will find the max hours we can get
         out of the window of business hours.
      */
      } else if (
        cursor.getTime() >= start.getTime() &&
        cursor.getTime() < end.getTime() &&
        msRemaining > 0
      ) {
        const msAvailable = end.getTime() - cursor.getTime();
        const msToAdd = Math.min(msAvailable, msRemaining);
        cursor.setTime(cursor.getTime() + msToAdd);
        msRemaining -= msToAdd;
      }
    });
    /*
        We want to increment the day count and set the time to midnight to fully utilize the next day's business hours.
        Using setTime to add an entire day and then set the time to midnight to address
        the edge case of the last day of the month.
      */
    if (msRemaining > 0 && cursor.toISOString().slice(0, 10) === startingDate) {
      cursor.setTime(cursor.getTime() + DAY_IN_MS);
      cursor.setUTCHours(0, 0, 0, 0);
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

export async function getBusinessHoursForTeam(team, day) {
  const offices = await getOfficesForTeam(team);
  const hours: { start; end }[] = [];
  const utcDay = new Date(day).getUTCDay();
  // Saturday is 6, Sunday is 0
  const isWeekend = utcDay === 6 || utcDay === 0;
  /*
    Using moment timezone to deal with daylight savings instead of hardcoding UTC hours.
    If offices is empty, then we default to sfo office
  */
  (offices?.length > 0 ? offices : ['sfo']).forEach((office) => {
    if (!HOLIDAY_CONFIG[office]?.dates.includes(day) && !isWeekend) {
      hours.push({
        start: new Date(
          moment
            .tz(`${day} 09:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
            .utc()
            .toISOString()
        ),
        end: new Date(
          moment
            .tz(`${day} 17:00`, 'YYYY-MM-DD hh:mm', OFFICE_TIME_ZONES[office])
            .utc()
            .toISOString()
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
