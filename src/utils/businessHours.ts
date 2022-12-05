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

export async function calculateDate(numDays, timestamp, team) {
  const dateObj = new Date(timestamp);
  const offices = await getOfficesForTeam(team, false);
  for (let i = 1; i <= numDays; i++) {
    dateObj.setDate(dateObj.getDate() + 1);
    // Saturday: Day 6
    // Sunday: Day 0
    if (dateObj.getUTCDay() === 6) {
      dateObj.setDate(dateObj.getDate() + 2);
    } else if (dateObj.getUTCDay() === 0) {
      dateObj.setDate(dateObj.getDate() + 1);
    }
    // If all offices are all on holiday, we skip the day.
    // Otherwise, we count the day for our SLA's
    let shouldSkipDate = false;
    offices.forEach((office) => {
      if (
        HOLIDAY_CONFIG[office].dates.includes(
          // slicing the string here since we only care about YYYY/MM/DD
          dateObj.toISOString().slice(0, 10)
        )
      ) {
        shouldSkipDate = true;
      } else {
        shouldSkipDate = false;
      }
    });
    if (shouldSkipDate) {
      i -= 1;
    }
  }
  return dateObj.toISOString();
}

export async function calculateSLOViolationTriage(
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
    return calculateDate(MAX_TRIAGE_DAYS, timestamp, team);
  }
  // calculate time to triage for issues that are rerouted
  else if (
    target_name.startsWith(TEAM_LABEL_PREFIX) &&
    labels?.some((label) => label.name === UNTRIAGED_LABEL)
  ) {
    return calculateDate(MAX_TRIAGE_DAYS, timestamp, target_name);
  }
  return null;
}

export async function calculateSLOViolationRoute(
  target_name,
  action,
  timestamp
) {
  if (target_name === UNROUTED_LABEL && action === 'labeled') {
    return calculateDate(MAX_ROUTE_DAYS, timestamp, 'Team: Support');
  }
  return null;
}

export async function setCache(team) {
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
  cache[team] = orderedOffices;
}

export async function getOfficesForTeam(team, update) {
  if (cache[team]) {
    return cache[team];
  }
  await setCache(team);
  return cache[team];
}
