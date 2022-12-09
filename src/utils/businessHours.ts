import fs from 'fs';

import yaml from 'js-yaml';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import {
  BUSINESS_HOURS,
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  TEAM_LABEL_PREFIX,
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
} from '@/config';

const BUSINESS_DAY_IN_MS = 8 * 60 * 60 * 1000;

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
  const dateObj = new Date(timestamp);
  let numMilliseconds = numDays * BUSINESS_DAY_IN_MS;
  const businessDayMilliseconds = BUSINESS_DAY_IN_MS;
  while (numMilliseconds > 0) {
    const officeHours = await getBusinessHoursForTeam(team, dateObj.toISOString().slice(0, 10));
    const startingDate = dateObj.toISOString().slice(0, 10)
    officeHours.forEach((timePeriod) => {
      const start = new Date(timePeriod.start);
      const end = new Date(timePeriod.end);
      if (dateObj.getTime() < start.getTime() && numMilliseconds > 0) {
        dateObj.setTime(start.getTime());
        const millisecondsToAdd = Math.min(businessDayMilliseconds, numMilliseconds);
        dateObj.setTime(dateObj.getTime() + millisecondsToAdd);
        numMilliseconds -= millisecondsToAdd;
      }
      else if (dateObj.getTime() >= start.getTime() && dateObj.getTime() < end.getTime() && numMilliseconds > 0){
        const hoursAvailable = end.getTime() - dateObj.getTime();
        const millisecondsToAdd = Math.min(hoursAvailable, numMilliseconds);
        dateObj.setTime(dateObj.getTime() + millisecondsToAdd);
        numMilliseconds -= millisecondsToAdd;
      }
    })
    if (numMilliseconds > 0 && dateObj.toISOString().slice(0, 10) === startingDate) {
      dateObj.setDate(dateObj.getDate() + 1);
      dateObj.setHours(0, 0, 0, 0);
    }
    else if (numMilliseconds === 0) {
      return dateObj.toISOString();
    }
  }
  return dateObj.toISOString();
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
    ).reduce((acc, item) => acc.concat(item.offices), [])
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
  const isWeekend = utcDay === 6 || utcDay === 0
  // Using moment timezone to deal with daylight savings instead of hardcoding UTC hours
  offices.forEach((office) => {
    if (!HOLIDAY_CONFIG[office]?.dates.includes(day) && !isWeekend) {
      hours.push({
        start: moment
          .tz(`${day} 09:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS[office])
          .utc()
          .toISOString(),
        end: moment
          .tz(`${day} 17:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS[office])
          .utc()
          .toISOString(),
      });
    }
  });
  // If no channels are subscribed to the notifications for a team label, default to sfo
  if (offices.length === 0) {
    hours.push({
      start: moment
        .tz(`${day} 09:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS['sfo'])
        .utc()
        .toISOString(),
      end: moment
        .tz(`${day} 17:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS['sfo'])
        .utc()
        .toISOString(),
    });
  }
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
