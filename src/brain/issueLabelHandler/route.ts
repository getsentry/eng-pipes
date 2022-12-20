import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { SENTRY_ORG, TEAM_LABEL_PREFIX } from '@/config';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
} from '@utils/businessHours';
import { getOssUserType } from '@utils/getOssUserType';
import { isFromABot } from '@utils/isFromABot';

const REPOS_TO_TRACK_FOR_ROUTING = new Set([
  'test-sentry-app',
  'sentry',
  'sentry-docs',
]);

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

function isNotATeamLabel(payload) {
  return !payload.label?.name.startsWith(TEAM_LABEL_PREFIX);
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
  const readableTimeToRouteBy = moment(timeToRouteBy).utc().toString();
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: `Thanks for filing this issue!\n @getsentry/support will get back to you by **<time datetime=${timeToRouteBy}>${readableTimeToRouteBy}</time>**`,
  });

  tx.finish();
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
    isNotATeamLabel,
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

  // strip the "Team: " and replace all whitespaces with hyphen
  const strippedTeam =
    teamLabelName?.substr(6).replace(' ', '-').toLowerCase() || '';
  let comment;
  try {
    const labelSlugName = strippedTeam;
    await octokit.teams.getByName({
      org: SENTRY_ORG,
      team_slug: labelSlugName,
    });
    comment = `Routing to @${SENTRY_ORG}/${labelSlugName} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage). ⏲️`;
  } catch (error) {
    // If the label name doesn't work, try description
    try {
      const descriptionSlugName = teamLabel?.description || '';
      await octokit.teams.getByName({
        org: SENTRY_ORG,
        team_slug: descriptionSlugName,
      });
      comment = `Routing to @${SENTRY_ORG}/${descriptionSlugName} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage). ⏲️`;
    } catch {
      comment = `Failed to route to ${teamLabelName}. Defaulting to @${SENTRY_ORG}/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage). ⏲️`;
    }
  }

  const timeToTriageBy = await calculateSLOViolationTriage(UNTRIAGED_LABEL, [
    teamLabel,
  ]);
  const readableTimeToTriageBy = moment(timeToTriageBy).utc().toString();
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: `${comment} \n The Sentry team will respond by **<time datetime=${timeToTriageBy}>${readableTimeToTriageBy}</time>**`,
  });

  tx.finish();
}
