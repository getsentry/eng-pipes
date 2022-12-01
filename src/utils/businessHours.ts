import fs from 'fs';

import yaml from 'js-yaml';
import moment from 'moment-timezone';

import { db } from '@utils/db';
export const getLabelsTable = () => db('label_to_channel');

import {
  BUSINESS_HOURS,
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  TEAM_LABEL_PREFIX,
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
} from '@/config';

const holidayFile = fs.readFileSync('holidays.yml');
const HOLIDAY_CONFIG = yaml.load(holidayFile);

const officeHourOrdering: Record<string, number> = {
  vie: 1,
  ams: 2,
  yyz: 3,
  sfo: 4,
  sea: 5,
};
const cache = {};

export async function calcDate(numDays, timestamp, team) {
  const dateObj = new Date(timestamp);
  const offices = await getOfficesForTeam(team, false);
  for (let i = 1; i <= numDays; i++) {
    dateObj.setDate(dateObj.getDate() + 1);
    // Saturday: Day 6
    // Sunday: Day 0
    if (dateObj.getDay() === 6) {
      dateObj.setDate(dateObj.getDate() + 2);
    } else if (dateObj.getDay() === 0) {
      dateObj.setDate(dateObj.getDate() + 1);
    }
    offices.forEach((office) => {
      if (
        HOLIDAY_CONFIG[office].dates.includes(
          dateObj.toISOString().slice(0, 10)
        )
      ) {
        dateObj.setDate(dateObj.getDate() + 1);
      }
    });
  }
  return dateObj.toISOString();
}

export function calculateSLOViolationTriage(
  target_name,
  action,
  timestamp,
  labels
) {
  // calculate time to triage for issues that come in with untriaged label
  if (target_name === UNTRIAGED_LABEL && action === 'labeled') {
    const team = labels?.find((label) =>
      label.name.startsWith(TEAM_LABEL_PREFIX)
    )?.name;
    return calcDate(MAX_TRIAGE_DAYS, timestamp, team);
  }
  // calculate time to triage for issues that are rerouted
  else if (
    target_name.startsWith(TEAM_LABEL_PREFIX) &&
    labels?.some((label) => label.name === UNTRIAGED_LABEL)
  ) {
    return calcDate(MAX_TRIAGE_DAYS, timestamp, target_name);
  }
  return null;
}

export function calculateSLOViolationRoute(target_name, action, timestamp) {
  if (target_name === UNROUTED_LABEL && action === 'labeled') {
    return calcDate(MAX_ROUTE_DAYS, timestamp, 'Team: Support');
  }
  return null;
}

export async function getOfficesForTeam(team, update) {
  if (cache[team] && !update) {
    return cache[team];
  }
  const officesSet = new Set(
    (
      await getLabelsTable()
        .where({
          label_name: team,
        })
        .select('offices')
    ).reduce((acc, item) => acc.concat(item.offices), [])
  );
  const orderedOffices = [...officesSet].sort(
    (a: any, b: any) => officeHourOrdering[a] - officeHourOrdering[b]
  );
  cache[team] = orderedOffices;
  return orderedOffices;
}

export async function getBusinessHoursForTeam(team, day) {
  const offices = await getOfficesForTeam(team, false);
  const hours: { start; end }[] = [];
  offices.forEach((office) => {
    if (!HOLIDAY_CONFIG[office].dates.includes(day)) {
      hours.push({
        start: moment
          .tz(`${day} 09:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS[office])
          .utc()
          .toString(),
        end: moment
          .tz(`${day} 17:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS[office])
          .utc()
          .toString(),
      });
    }
  });
  // If no channels are subscribed to the notifications for a team label, default to sfo
  if (!hours.length) {
    hours.push({
      start: moment
        .tz(`${day} 09:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS['sfo'])
        .utc()
        .toString(),
      end: moment
        .tz(`${day} 17:00`, 'YYYY-MM-DD hh:mm', BUSINESS_HOURS['sfo'])
        .utc()
        .toString(),
    });
  }
  return hours;
}

calcDate(1, Date.now(), 'Team: Ingest');
