import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import {
  BACKLOG_LABEL,
  OWNER,
  PRODUCT_AREA_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '@/config';
import { Issue } from '@/types';
import { isChannelInBusinessHours } from '@/utils/businessHours';
import {
  addIssueToGlobalIssuesProject,
  getIssueDueDateFromProject,
} from '@/utils/githubEventHelpers';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

const GH_API_PER_PAGE = 100;
const DEFAULT_PRODUCT_AREA_LABEL = 'Product Area: Other';
const getChannelLastNotifiedTable = () => db('channel_last_notified');

type SlackMessageIssueItem = {
  triageBy: string;
  fields: [
    // Issue title and link
    {
      text: string;
      type: string;
    },
    // Time until issue is due
    {
      text: string;
      type: string;
    }
  ];
};

type IssueSLOInfo = {
  url: string;
  number: number;
  title: string;
  productAreaLabel: string;
  triageBy: string;
  createdAt: string;
};

type SlackMessageBlocks = {
  type: string;
  text?: object;
  fields?: object;
};

export const opts = {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'string',
            },
          },
        },
      },
    },
  },
};

const getLabelName = (label?: Issue['labels'][number]) =>
  typeof label === 'string' ? label : label?.name || '';

const getIssueProductAreaLabel = (issue: Issue) => {
  const label = issue.labels.find((label) =>
    getLabelName(label).startsWith(PRODUCT_AREA_LABEL_PREFIX)
  );
  return getLabelName(label) || DEFAULT_PRODUCT_AREA_LABEL;
};

// TODO: Remove this once Status: Backlog is gone.
const filterIssuesOnBacklog = (issue: Issue) => {
  return (
    issue.labels.find((label) => {
      getLabelName(label) === BACKLOG_LABEL;
    }) === undefined
  );
};

export const getTriageSLOTimestamp = async (
  octokit: Octokit,
  repo: string,
  issueNumber: number,
  issueNodeId: string
) => {
  const issueNodeIdInProject = await addIssueToGlobalIssuesProject(
    issueNodeId,
    repo,
    issueNumber,
    octokit
  );
  const dueByDate = await getIssueDueDateFromProject(
    issueNodeIdInProject,
    octokit
  );
  if (dueByDate == null || !moment(dueByDate).isValid()) {
    // TODO: delete week of Jun 26
    const issues = await octokit.paginate(octokit.issues.listComments, {
      owner: OWNER,
      repo,
      issue_number: issueNumber,
      per_page: GH_API_PER_PAGE,
    });
    const routingEvents = issues.filter(
      (event) =>
        // @ts-ignore - We _know_ a `label` property exists on `labeled` events
        event.user.type === 'Bot' && event.user.login === 'getsantry[bot]'
    );
    const lastRouteComment = routingEvents[routingEvents.length - 1];
    // use regex to parse the timestamp from the bot comment
    const parseBodyForDatetime = lastRouteComment?.body?.match(
      /<time datetime=(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)>/
    )?.groups;

    if (!parseBodyForDatetime?.timestamp) {
      // Throw an exception if we have trouble parsing the timestamp
      Sentry.captureException(
        new Error(
          `Could not parse timestamp from comments for ${repo}/issues/${issueNumber}`
        )
      );
      return moment().toISOString();
    }
    return parseBodyForDatetime.timestamp;
  }
  return dueByDate;
};

export const constructSlackMessage = (
  notificationChannels: Record<string, string[]>,
  productAreaToIssuesMap: Record<string, IssueSLOInfo[]>,
  now: moment.Moment
) => {
  return Object.keys(notificationChannels).flatMap(async (channelId) => {
    // Group issues into buckets based on time left until SLA
    let hasEnoughTimePassedSinceIssueCreation = false;
    const overdueIssues: SlackMessageIssueItem[] = [];
    const actFastIssues: SlackMessageIssueItem[] = [];
    const triageQueueIssues: SlackMessageIssueItem[] = [];
    if (await isChannelInBusinessHours(channelId, now)) {
      notificationChannels[channelId].map((productArea) => {
        productAreaToIssuesMap[productArea].forEach(
          ({ url, number, title, triageBy, createdAt }) => {
            // Escape issue title for < and > characters
            const escapedIssueTitle = title
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            const hoursLeft = now.diff(triageBy, 'hours') * -1;
            const minutesLeft =
              now.diff(triageBy, 'minutes') * -1 - hoursLeft * 60;
            const daysLeft = now.diff(triageBy, 'days') * -1;
            hasEnoughTimePassedSinceIssueCreation =
              hasEnoughTimePassedSinceIssueCreation ||
              now.diff(createdAt, 'hours') > 4;
            if (daysLeft <= -1) {
              const daysText =
                daysLeft * -1 === 1
                  ? `${daysLeft * -1} day`
                  : `${daysLeft * -1} days`;
              overdueIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      overdueIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  { text: `${daysText} overdue`, type: 'mrkdwn' },
                ],
              });
            } else if (hoursLeft < -4) {
              const hoursText =
                hoursLeft * -1 === 1
                  ? `${hoursLeft * -1} hour`
                  : `${hoursLeft * -1} hours`;
              overdueIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      overdueIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  { text: `${hoursText} overdue`, type: 'mrkdwn' },
                ],
              });
            } else if (hoursLeft <= -1) {
              const minutesText =
                minutesLeft * -1 === 1
                  ? `${minutesLeft * -1} minute`
                  : `${minutesLeft * -1} minutes`;
              const hoursText =
                hoursLeft * -1 === 1
                  ? `${hoursLeft * -1} hour`
                  : `${hoursLeft * -1} hours`;
              overdueIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      overdueIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  {
                    text: `${hoursText} ${minutesText} overdue`,
                    type: 'mrkdwn',
                  },
                ],
              });
            } else if (hoursLeft == 0 && minutesLeft <= 0) {
              const minutesText =
                minutesLeft * -1 === 1
                  ? `${minutesLeft * -1} minute`
                  : `${minutesLeft * -1} minutes`;
              overdueIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      overdueIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  { text: `${minutesText} overdue`, type: 'mrkdwn' },
                ],
              });
            } else if (hoursLeft == 0 && minutesLeft >= 0) {
              const minutesText =
                minutesLeft === 1
                  ? `${minutesLeft} minute`
                  : `${minutesLeft} minutes`;
              actFastIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      actFastIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  { text: `${minutesText} left`, type: 'mrkdwn' },
                ],
              });
            } else if (hoursLeft <= 4) {
              const minutesText =
                minutesLeft === 1
                  ? `${minutesLeft} minute`
                  : `${minutesLeft} minutes`;
              const hoursText =
                hoursLeft === 1 ? `${hoursLeft} hour` : `${hoursLeft} hours`;
              actFastIssues.push({
                triageBy,
                fields: [
                  {
                    text: `${
                      actFastIssues.length + 1
                    }. <${url}|#${number} ${escapedIssueTitle}>`,
                    type: 'mrkdwn',
                  },
                  { text: `${hoursText} ${minutesText} left`, type: 'mrkdwn' },
                ],
              });
            } else {
              if (daysLeft < 1) {
                triageQueueIssues.push({
                  triageBy,
                  fields: [
                    {
                      text: `${
                        triageQueueIssues.length + 1
                      }. <${url}|#${number} ${escapedIssueTitle}>`,
                      type: 'mrkdwn',
                    },
                    { text: `${hoursLeft} hours left`, type: 'mrkdwn' },
                  ],
                });
              } else {
                const daysText =
                  daysLeft === 1 ? `${daysLeft} day` : `${daysLeft} days`;
                triageQueueIssues.push({
                  triageBy,
                  fields: [
                    {
                      text: `${
                        triageQueueIssues.length + 1
                      }. <${url}|#${number} ${escapedIssueTitle}>`,
                      type: 'mrkdwn',
                    },
                    { text: `${daysText} left`, type: 'mrkdwn' },
                  ],
                });
              }
            }
          }
        );
      });
      const sortAndFlattenIssuesArray = (issues) =>
        issues
          .sort(
            (a, b) =>
              moment(a.triageBy).valueOf() - moment(b.triageBy).valueOf()
          )
          .map((item) => item.fields)
          .flat();
      const messageBlocks: SlackMessageBlocks[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Hey! You have some tickets to triage:',
          },
        },
        {
          type: 'divider',
        },
      ];
      if (overdueIssues.length > 0) {
        const formattedIssues = sortAndFlattenIssuesArray(overdueIssues);
        messageBlocks.push({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `🚨 *Overdue*` },
            { type: 'mrkdwn', text: `😰` },
          ],
        });
        for (let i = 0; i < formattedIssues.length; i += 2) {
          messageBlocks.push({
            type: 'section',
            fields: [formattedIssues[i], formattedIssues[i + 1]],
          });
        }
      }
      if (actFastIssues.length > 0) {
        const formattedIssues = sortAndFlattenIssuesArray(actFastIssues);
        messageBlocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `⌛️ *Act fast!*`,
            },
            { type: 'mrkdwn', text: `😨` },
          ],
        });
        for (let i = 0; i < formattedIssues.length; i += 2) {
          messageBlocks.push({
            type: 'section',
            fields: [formattedIssues[i], formattedIssues[i + 1]],
          });
        }
      }
      const result = await getChannelLastNotifiedTable()
        .where({ channel_id: channelId })
        .select('last_notified_at');
      const hasEnoughTimePassedSinceLastNotification =
        result.length > 0
          ? now.diff(result[0].last_notified_at, 'hours') >= 4
          : true;
      const shouldNotifyForOnlyTriagedQueue =
        hasEnoughTimePassedSinceLastNotification &&
        hasEnoughTimePassedSinceIssueCreation;
      const formattedIssues = sortAndFlattenIssuesArray(triageQueueIssues);
      if (
        triageQueueIssues.length > 0 &&
        overdueIssues.length === 0 &&
        actFastIssues.length === 0
      ) {
        messageBlocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `⏳ *Triage Queue*`,
            },
            { type: 'mrkdwn', text: `😯` },
          ],
        });
        for (let i = 0; i < formattedIssues.length; i += 2) {
          messageBlocks.push({
            type: 'section',
            fields: [formattedIssues[i], formattedIssues[i + 1]],
          });
        }
      }
      /*
        Two cases to skip sending message
        1. No issues in any queue
        2. Issues are in triage queue but channel doesn't need to be notified
      */
      if (
        (overdueIssues.length === 0 &&
          actFastIssues.length === 0 &&
          triageQueueIssues.length === 0) ||
        (overdueIssues.length === 0 &&
          actFastIssues.length === 0 &&
          triageQueueIssues.length > 0 &&
          !shouldNotifyForOnlyTriagedQueue)
      ) {
        return Promise.resolve();
      }
      return bolt.client.chat
        .postMessage({
          channel: channelId,
          text: '👋 Triage Reminder ⏰',
          blocks: messageBlocks,
        })
        .then(async () => {
          await getChannelLastNotifiedTable()
            .insert({ channel_id: channelId, last_notified_at: now })
            .onConflict('channel_id')
            .merge();
        });
    }
    return Promise.resolve();
  });
};

export const notifyProductOwnersForUntriagedIssues = async (
  repos: string[],
  octokit: Octokit,
  now: moment.Moment
) => {
  // 1. Get all open, untriaged issues
  // 2. Get all the events for each of the remaining issues
  // 3. Find the latest `label` event for the UNTRIAGED_LABEL
  // 4. Get the time elapsed since that latest labeling event above
  // 5. Filter out the issues which were labeled more than MAX_TRIAGE_TIME ago
  const getIssueSLOInfoForRepo = async (
    repo: string
  ): Promise<IssueSLOInfo[]> => {
    const untriagedIssues = await octokit.paginate(octokit.issues.listForRepo, {
      owner: OWNER,
      repo,
      state: 'open',
      labels: WAITING_FOR_PRODUCT_OWNER_LABEL,
      per_page: GH_API_PER_PAGE,
    });

    const issuesWithSLOInfo = untriagedIssues
      .filter(filterIssuesOnBacklog)
      .map(async (issue) => ({
        url: issue.html_url,
        number: issue.number,
        title: issue.title,
        productAreaLabel: getIssueProductAreaLabel(issue),
        triageBy: await getTriageSLOTimestamp(
          octokit,
          repo,
          issue.number,
          issue.node_id
        ),
        createdAt: issue.created_at,
      }));

    return Promise.all(issuesWithSLOInfo);
  };

  const issuesToNotifyAbout = (
    await Promise.all(repos.map(getIssueSLOInfoForRepo))
  ).flat();

  // Get an N-to-N mapping of "Product Area: *" labels to issues
  const productAreaToIssuesMap: Record<string, IssueSLOInfo[]> = {};
  const productAreasToNotify = new Set() as Set<string>;
  issuesToNotifyAbout.forEach((data) => {
    if (data.productAreaLabel in productAreaToIssuesMap) {
      productAreaToIssuesMap[data.productAreaLabel].push(data);
    } else {
      productAreaToIssuesMap[data.productAreaLabel] = [data];
      productAreasToNotify.add(data.productAreaLabel);
    }
  });
  // Get a mapping from Channels to subscribed product areas
  const notificationChannels: Record<string, string[]> = (
    await getLabelsTable()
      .select('label_name', 'channel_id')
      .whereIn('label_name', Array.from(productAreasToNotify))
  ).reduce((res, { label_name, channel_id }) => {
    const productAreas = res[channel_id] || [];
    productAreas.push(label_name);
    res[channel_id] = productAreas;
    return res;
  }, {});

  // Notify all channels associated with the relevant `Product Area: *` label per issue
  const notifications = constructSlackMessage(
    notificationChannels,
    productAreaToIssuesMap,
    now
  );
  // Do all this in parallel and wait till all finish
  await Promise.all(notifications);
};
