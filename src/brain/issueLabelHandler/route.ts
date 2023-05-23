import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';
import { ISSUES_PROJECT_NODE_ID, PRODUCT_AREA_FIELD_ID } from '@/config';

import {
  isNotFromAnExternalOrGTMUser,
  shouldSkip,
} from '@/brain/issueLabelHandler/helpers';
import {
  BACKLOG_LABEL,
  IN_PROGRESS_LABEL,
  OFFICE_TIME_ZONES,
  OFFICES_24_HOUR,
  PRODUCT_AREA_LABEL_PREFIX,
  SENTRY_ORG,
  STATUS_LABEL_PREFIX,
  UNKNOWN_LABEL,
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
  WAITING_FOR_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
  getSortedOffices,
  isTimeInBusinessHours,
} from '@utils/businessHours';
import { isFromABot } from '@utils/isFromABot';
import { slugizeProductArea } from '@utils/slugizeProductArea';

const REPOS_TO_TRACK_FOR_ROUTING = new Set(['sentry', 'sentry-docs']);

import { ClientType } from '@/api/github/clientType';
import { getClient } from '@api/github/getClient';

function isAlreadyUnrouted(payload) {
  return payload.issue.labels.some(({ name }) => name === UNROUTED_LABEL);
}

function isNotInARepoWeCareAboutForRouting(payload) {
  return !REPOS_TO_TRACK_FOR_ROUTING.has(payload.repository.name);
}

function isValidLabel(payload) {
  return (
    !payload.label?.name.startsWith(PRODUCT_AREA_LABEL_PREFIX) ||
    payload.issue.labels?.some(
      (label) =>
        label.name === BACKLOG_LABEL || label.name === IN_PROGRESS_LABEL
    ) ||
    payload.issue.state !== 'open'
  );
}

function shouldLabelBeRemoved(label, target_name) {
  return (
    (label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX) &&
      label.name !== target_name) ||
    (label.name.startsWith(STATUS_LABEL_PREFIX) &&
      label.name !== UNTRIAGED_LABEL) ||
    label.name.startsWith(WAITING_FOR_LABEL_PREFIX)
  );
}

function getProductArea(productAreaLabelName) { 
  return productAreaLabelName?.substr(
    PRODUCT_AREA_LABEL_PREFIX.length
  );
}

async function addIssueToProject(issueNodeID, octokit) {
  const addIssueToprojectMutation = `mutation {
    addProjectV2ItemById(input: {projectId: "${ISSUES_PROJECT_NODE_ID}" contentId: "${issueNodeID}"}) {
      item {
        id
      }
    }
  }`

  return await octokit.graphql(addIssueToprojectMutation);
}

async function getAllProductAreaNodeIDs(octokit) {
  const queryForProductAreaNodeIDs = `query{
    node(id: "${PRODUCT_AREA_FIELD_ID}") {
      ... on ProjectV2SingleSelectField {
        options {
          id
          name
        }
      }
    }
  }`

  const data = await octokit.graphql(queryForProductAreaNodeIDs);
  return data.node.options.reduce((acc, {name, id}) => {
    acc[name] = id;
    return acc;
  }, {})
}

async function modifyProjectIssueProductArea(issueNodeID, productAreaLabelName, octokit) {
  const productArea = getProductArea(productAreaLabelName);
  const productAreaNodeIDMapping = await getAllProductAreaNodeIDs(octokit);
  const addIssueToprojectMutation = `mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${ISSUES_PROJECT_NODE_ID}"
        itemId: "${issueNodeID}"
        fieldId: "${PRODUCT_AREA_FIELD_ID}"
        value: {
          singleSelectOptionId: "${productAreaNodeIDMapping[productArea]}"
        }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }`

  await octokit.graphql(addIssueToprojectMutation);
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
    isNotFromAnExternalOrGTMUser,
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
    labels: [UNROUTED_LABEL, WAITING_FOR_SUPPORT_LABEL],
  });

  const timeToRouteBy = await calculateSLOViolationRoute(UNROUTED_LABEL);
  const { readableDueByDate, lastOfficeInBusinessHours } =
    await getReadableTimeStamp(timeToRouteBy, UNKNOWN_LABEL);
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: `Assigning to @${SENTRY_ORG}/support for [routing](https://open.sentry.io/triage/#2-route), due by **<time datetime=${timeToRouteBy}>${readableDueByDate}</time> (${lastOfficeInBusinessHours})**. ⏲️`,
  });

  await addIssueToProject(payload.issue.node_id, octokit);

  tx.finish();
}

async function routeIssue(octokit, productAreaLabelName) {
  try {
    const productArea = getProductArea(productAreaLabelName);
    const ghTeamSlug = 'product-owners-' + slugizeProductArea(productArea);
    await octokit.teams.getByName({
      org: SENTRY_ORG,
      team_slug: ghTeamSlug,
    }); // expected to throw if team doesn't exist
    return `Routing to @${SENTRY_ORG}/${ghTeamSlug} for [triage](https://develop.sentry.dev/processing-tickets/#3-triage)`;
  } catch (error) {
    Sentry.captureException(error);
    return `Failed to route for ${productAreaLabelName}. Defaulting to @${SENTRY_ORG}/open-source for [triage](https://develop.sentry.dev/processing-tickets/#3-triage)`;
  }
}

async function getReadableTimeStamp(timeToTriageBy, productAreaLabelName) {
  const dueByMoment = moment(timeToTriageBy).utc();
  const officesForProductArea = await getSortedOffices(productAreaLabelName);
  let lastOfficeInBusinessHours;
  (officesForProductArea.length > 0 ? officesForProductArea : ['sfo']).forEach(
    (office) => {
      if (isTimeInBusinessHours(dueByMoment, office)) {
        lastOfficeInBusinessHours = office;
      }
    }
  );
  if (lastOfficeInBusinessHours == null) {
    lastOfficeInBusinessHours = 'sfo';
    Sentry.captureMessage(
      `Unable to find an office in business hours for ${productAreaLabelName} for time ${timeToTriageBy}`
    );
  }
  const officeDateFormat =
    lastOfficeInBusinessHours &&
    OFFICES_24_HOUR.includes(lastOfficeInBusinessHours)
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
  const productAreaLabel = label;
  const productAreaLabelName = productAreaLabel?.name;
  // Remove Unrouted label when routed.
  const owner = payload.repository.owner.login;
  const octokit = await getClient(ClientType.App, owner);
  const labelsToRemove: string[] = [];

  // When routing, remove all Status and Product Area labels that currently exist on issue
  issue.labels?.forEach((label) => {
    if (shouldLabelBeRemoved(label, productAreaLabelName)) {
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
    labels: [UNTRIAGED_LABEL, WAITING_FOR_PRODUCT_OWNER_LABEL],
  });

  const routedTeam = await routeIssue(octokit, productAreaLabelName);

  const timeToTriageBy = await calculateSLOViolationTriage(UNTRIAGED_LABEL, [
    productAreaLabel,
  ]);

  const { readableDueByDate, lastOfficeInBusinessHours } =
    await getReadableTimeStamp(timeToTriageBy, productAreaLabelName);
  const dueBy = `due by **<time datetime=${timeToTriageBy}>${readableDueByDate}</time> (${lastOfficeInBusinessHours})**. ⏲️`;
  const comment = `${routedTeam}, ${dueBy}`;
  await octokit.issues.createComment({
    owner,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: comment,
  });

  /**
   * We'll try adding the issue to our global issues project. If it already exists, the existing ID will be returned
   * https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#adding-an-item-to-a-project
   */
  const issueNodeId = (await addIssueToProject(payload.issue.node_id, octokit))?.addProjectV2ItemById.item.id;
  await modifyProjectIssueProductArea(issueNodeId, productAreaLabelName, octokit);

  tx.finish();
}
