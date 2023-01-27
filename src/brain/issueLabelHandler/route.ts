import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import {
  OFFICE_TIME_ZONES,
  OFFICES_EU,
  SENTRY_ORG,
  TEAM_LABEL_PREFIX,
} from '@/config';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
  getSortedOffices,
  isTimeInBusinessHours,
} from '@utils/businessHours';
import { getOssUserType } from '@utils/getOssUserType';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK_FOR_ROUTING = new Set(['sentry', 'sentry-docs']);

import { ClientType } from '@/api/github/clientType';
import { UNROUTED_LABEL, UNTRIAGED_LABEL } from '@/config';
import { getClient } from '@api/github/getClient';

// Validation Helpers

async function shouldSkip(payload, reasonsToSkip) {
  // Could do Promise-based async here, but that was getting complicated[1] and
  // there's not really a performance concern (famous last words).
  //
  // [1] https://github.com/getsentry/eng-pipes/pull/212#discussion_r657365585

  for (const skipIf of reasonsToSkip) {
    if (await skipIf(payload)) {
      return true;
    }
  }
  return false;
}

function isAlreadyUnrouted(payload) {
  return payload.issue.labels.some(({ name }) => name === UNROUTED_LABEL);
}

async function isNotFromAnExternalUser(payload) {
  return (await getOssUserType(payload)) !== 'external';
}

function isNotInARepoWeCareAboutForRouting(payload) {
  return !REPOS_TO_TRACK_FOR_ROUTING.has(payload.repository.name);
}

function isValidLabel(payload) {
  return (
    !payload.label?.name.startsWith(TEAM_LABEL_PREFIX) ||
    payload.issue.labels?.some(
      (label) =>
        label.name === 'Status: Backlog' || label.name === 'Status: In Progress'
    ) ||
    payload.issue.state !== 'open'
  );
}

function shouldLabelBeRemoved(label, target_name) {
  return (
    (label.name.startsWith('Team: ') && label.name !== target_name) ||
    (label.name.startsWith('Status: ') && label.name !== UNTRIAGED_LABEL)
  );
}

// Markers of State

export async function markUnrouted({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.opened'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markUnrouted',
  });

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForRouting,
    isAlreadyUnrouted,
    isNotFromAnExternalUser,
  ];
  if (await shouldSkip(payload, reasonsToSkip)) {
    return;
  }

  // New issues get an Unrouted label.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  await octokit.issues.addLabels({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [UNROUTED_LABEL],
  });

  const timeToRouteBy = await calculateSLOViolationRoute(UNROUTED_LABEL);
  const { readableDueByDate, lastOfficeInBusinessHours } =
    await getReadableTimeStamp(timeToRouteBy, 'Team: Support');
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: `Assigning to @${SENTRY_ORG}/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=${timeToRouteBy}>${readableDueByDate}</time> (${lastOfficeInBusinessHours})**. ⏲️`,
  });

  tx.finish();
}

async function routeIssue(octokit, teamLabelName, teamDescription) {
  try {
    const strippedTeamName =
      teamLabelName?.substr(6).replace(' ', '-').toLowerCase() || '';
    await octokit.teams.getByName({
      org: SENTRY_ORG,
      team_slug: strippedTeamName,
    });
    return `Routing to @${SENTRY_ORG}/${strippedTeamName} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage)`;
  } catch (error) {
    // Use capture message here, because many teams rely on the label description for routing and it's not an exception we care about yet.
    Sentry.captureMessage(
      'Routing to team label name failed, retrying with label description'
    );
    // If the label name doesn't work, try description
    try {
      const descriptionSlugName = teamDescription || '';
      await octokit.teams.getByName({
        org: SENTRY_ORG,
        team_slug: descriptionSlugName,
      });
      return `Routing to @${SENTRY_ORG}/${descriptionSlugName} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage)`;
    } catch (error) {
      Sentry.captureException(error);
      return `Failed to route to ${teamLabelName}. Defaulting to @${SENTRY_ORG}/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage)`;
    }
  }
}

async function getReadableTimeStamp(timeToTriageBy, teamLabelName) {
  const dueByMoment = moment(timeToTriageBy);
  const officesForTeam = await getSortedOffices(teamLabelName);
  let lastOfficeInBusinessHours;
  (officesForTeam.length > 0 ? officesForTeam : ['sfo']).forEach((office) => {
    if (isTimeInBusinessHours(dueByMoment, office)) {
      lastOfficeInBusinessHours = office;
    }
  });
  if (lastOfficeInBusinessHours == null) {
    lastOfficeInBusinessHours = 'sfo';
    Sentry.captureMessage(
      `Unable to find an office in business hours for ${teamLabelName} for time ${timeToTriageBy}`
    );
  }
  const officeDateFormat =
    lastOfficeInBusinessHours && OFFICES_EU.includes(lastOfficeInBusinessHours)
      ? 'dddd, MMMM Do [at] HH:mm'
      : 'dddd, MMMM Do [at] h:mm a';
  return {
    readableDueByDate: dueByMoment
      .tz(OFFICE_TIME_ZONES[lastOfficeInBusinessHours])
      .format(officeDateFormat),
    lastOfficeInBusinessHours,
  };
}

export async function markRouted({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'issues.labeled'>) {
  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'issueLabelHandler.markRouted',
  });

  const reasonsToSkip = [
    isNotInARepoWeCareAboutForRouting,
    isFromABot,
    isValidLabel,
  ];
  if (await shouldSkip(payload, reasonsToSkip)) {
    return;
  }

  const { issue, label } = payload;
  const teamLabel = label;
  const teamLabelName = teamLabel?.name;
  // Remove Unrouted label when routed.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  const labelsToRemove: string[] = [];

  // When routing, remove all Status and Team labels that currently exist on issue
  issue.labels?.forEach((label) => {
    if (shouldLabelBeRemoved(label, teamLabelName)) {
      labelsToRemove.push(label.name);
    }
  });

  for (const label of labelsToRemove) {
    try {
      await octokit.issues.removeLabel({
        owner: owner,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        name: label,
      });
    } catch (error) {
      // @ts-expect-error
      if (error.status === 404) {
        // The label has already been removed. This can happen pretty easily if
        // a user adds two labels roughly simultaneously, because then we get
        // two labeled events and we end up with a race condition. We can
        // safely ignore because the label has been removed and that's all we
        // ever really wanted in life.
      } else {
        throw error;
      }
    }
  }

  await octokit.issues.addLabels({
    owner: owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    labels: [UNTRIAGED_LABEL],
  });

  const teamLabelDescription = teamLabel?.description;
  const routedTeam = await routeIssue(
    octokit,
    teamLabelName,
    teamLabelDescription
  );

  const timeToTriageBy = await calculateSLOViolationTriage(UNTRIAGED_LABEL, [
    teamLabel,
  ]);

  const { readableDueByDate, lastOfficeInBusinessHours } =
    await getReadableTimeStamp(timeToTriageBy, teamLabelName);
  const dueBy = `due by **<time datetime=${timeToTriageBy}>${readableDueByDate}</time> (${lastOfficeInBusinessHours})**. ⏲️`;
  const comment = `${routedTeam}, ${dueBy}`;
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: comment,
  });

  tx.finish();
}
