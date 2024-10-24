import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import {
  PRODUCT_AREA_LABEL_PREFIX,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
} from '@/config';
import { Issue } from '@/types/github';
import { getBusinessHoursLeft } from '@/utils/misc/businessHours';
import {
  ChannelItem,
  getChannelsForIssue,
} from '@/utils/slack/getChannelsForIssue';
import { GitHubOrg } from '@api/github/org';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

const GH_API_PER_PAGE = 100;
const DEFAULT_PRODUCT_AREA = 'Other';
const getChannelLastNotifiedTable = () => db('channel_last_notified');

// An item with all of its relevant properties stringified as markdown.
type SlackMessageUnorderedIssueItem = {
  triageBy: string;
  issueLink: string;
  timeLeft: string;
};

// Like the above, but the numerical prefix to each row now has a correct numerical ordering.
type SlackMessageOrderedIssueItem = {
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
  triageBy: string;
  createdAt: string;
  channels: ChannelItem[];
  productArea: string;
  repo: string;
  org: string;
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

const getLabelName = (label?: Issue['labels'][number]): string =>
  typeof label === 'string' ? label : label?.name || '';

const getIssueProductAreaLabel = (issue: Issue): string => {
  const label = issue.labels.find((label) =>
    getLabelName(label).startsWith(PRODUCT_AREA_LABEL_PREFIX)
  );
  return (
    getLabelName(label).slice(PRODUCT_AREA_LABEL_PREFIX.length) ||
    DEFAULT_PRODUCT_AREA
  );
};

// Note that the `ordinal` field is the literal number that will show up, not the index in the
// owning array. For example, it is the caller's responsibility to offset the 0-indexed entries of
// an array if a 1-indexed list is what we want the user to see (it almost always is).
const addOrderingToSlackMessageItem = (
  item: SlackMessageUnorderedIssueItem,
  ordinal: number
): SlackMessageOrderedIssueItem => {
  return {
    triageBy: item.triageBy,
    fields: [
      // Issue title and link
      {
        text: `${ordinal}. ${item.issueLink}`,
        type: 'mrkdwn',
      },
      // Time until issue is due
      {
        text: item.timeLeft,
        type: 'mrkdwn',
      },
    ],
  };
};

export const getTriageSLOTimestamp = async (
  org: GitHubOrg,
  repo: string,
  issueNumber: number,
  issueNodeId: string
): Promise<string> => {
  const issueNodeIdInProject = await org.addIssueToGlobalIssuesProject(
    issueNodeId,
    repo,
    issueNumber
  );
  const dueByDate = await org.getIssueDueDateFromProject(issueNodeIdInProject);
  if (dueByDate == null || !moment(dueByDate).isValid()) {
    // Throw an exception if we have trouble parsing the timestamp
    Sentry.captureException(
      new Error(
        `Could not parse timestamp from comments for ${repo}/issues/${issueNumber}`
      )
    );
    return moment().toISOString();
  }
  return dueByDate;
};

export const constructSlackMessage = (
  channelToIssuesMap: Record<string, IssueSLOInfo[]>,
  now: moment.Moment
): Promise<any>[] => {
  return Object.keys(channelToIssuesMap).flatMap(async (channelId) => {
    const overdueIssues: SlackMessageUnorderedIssueItem[] = [];
    const actFastIssues: SlackMessageUnorderedIssueItem[] = [];
    const triageQueueIssues: SlackMessageUnorderedIssueItem[] = [];
    // Group issues into buckets based on time left until SLA
    let hasEnoughTimePassedSinceIssueCreation = false;
    const addIssueToQueue = ({
      url,
      number,
      title,
      triageBy,
      createdAt,
      repo,
      org,
      productArea,
    }) => {
      // Escape issue title for < and > characters
      const escapedIssueTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const hoursLeft = now.diff(triageBy, 'hours') * -1;
      const businessHoursLeft = getBusinessHoursLeft(
        triageBy,
        now,
        repo,
        org,
        productArea
      );
      const minutesLeft = now.diff(triageBy, 'minutes') * -1 - hoursLeft * 60;
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
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${daysText} overdue`,
        });
      } else if (hoursLeft < -4) {
        const hoursText =
          hoursLeft * -1 === 1
            ? `${hoursLeft * -1} hour`
            : `${hoursLeft * -1} hours`;
        overdueIssues.push({
          triageBy,
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${hoursText} overdue`,
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
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${hoursText} ${minutesText} overdue`,
        });
      } else if (hoursLeft === 0 && minutesLeft <= 0) {
        const minutesText =
          minutesLeft * -1 === 1
            ? `${minutesLeft * -1} minute`
            : `${minutesLeft * -1} minutes`;
        overdueIssues.push({
          triageBy,
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${minutesText} overdue`,
        });
      } else if (hoursLeft === 0 && minutesLeft >= 0) {
        const minutesText =
          minutesLeft === 1
            ? `${minutesLeft} minute`
            : `${minutesLeft} minutes`;
        actFastIssues.push({
          triageBy,
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${minutesText} left`,
        });
      } else if (businessHoursLeft <= 4) {
        const minutesText =
          minutesLeft === 1
            ? `${minutesLeft} minute`
            : `${minutesLeft} minutes`;
        const hoursText =
          businessHoursLeft === 1
            ? `${businessHoursLeft} business hour`
            : `${businessHoursLeft} business hours`;
        actFastIssues.push({
          triageBy,
          issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
          timeLeft: `${hoursText} ${minutesText} left`,
        });
      } else {
        if (daysLeft < 1) {
          triageQueueIssues.push({
            triageBy,
            issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
            timeLeft: `${hoursLeft} hours left`,
          });
        } else {
          const daysText =
            daysLeft === 1 ? `${daysLeft} day` : `${daysLeft} days`;
          triageQueueIssues.push({
            triageBy,
            issueLink: `<${url}|#${number} ${escapedIssueTitle}>`,
            timeLeft: `${daysText} left`,
          });
        }
      }
    };

    channelToIssuesMap[channelId].forEach(addIssueToQueue);

    const sortAndFlattenIssuesArray = (issues) =>
      issues
        .sort(
          (a, b) => moment(a.triageBy).valueOf() - moment(b.triageBy).valueOf()
        )
        .map((item, index) => {
          return addOrderingToSlackMessageItem(item, index + 1).fields;
        })
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
  });
};

export const notifyProductOwnersForUntriagedIssues = async (
  org: GitHubOrg,
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
    // TODO(team-ospo/issues#200): Add codecov support
    const untriagedIssues =
      org.slug === 'codecov'
        ? []
        : await org.api.paginate(org.api.issues.listForRepo, {
            owner: org.slug,
            repo,
            state: 'open',
            labels: WAITING_FOR_PRODUCT_OWNER_LABEL,
            per_page: GH_API_PER_PAGE,
          });

    const issuesWithSLOInfo = untriagedIssues.map(async (issue) => ({
      url: issue.html_url,
      number: issue.number,
      title: issue.title,
      triageBy: await getTriageSLOTimestamp(
        org,
        repo,
        issue.number,
        issue.node_id
      ),
      createdAt: issue.created_at,
      channels: getChannelsForIssue(
        repo,
        org.slug,
        getIssueProductAreaLabel(issue),
        now
      ),
      productArea: getIssueProductAreaLabel(issue),
      repo,
      org: org.slug,
    }));
    return Promise.all(issuesWithSLOInfo);
  };

  const issuesToNotifyAbout = (
    await Promise.all(
      [...org.repos.withRouting, ...org.repos.withoutRouting].map(
        getIssueSLOInfoForRepo
      )
    )
  ).flat();

  // Get an N-to-N mapping of "Product Area: *" labels to issues
  const channelToIssuesMap: Record<string, IssueSLOInfo[]> = {};
  issuesToNotifyAbout.forEach((data) => {
    if (data.channels) {
      data.channels.forEach((channel) => {
        if (channel.isChannelInBusinessHours) {
          if (channel.channelId in channelToIssuesMap) {
            channelToIssuesMap[channel.channelId].push(data);
          } else {
            channelToIssuesMap[channel.channelId] = [data];
          }
        }
      });
    }
  });

  // Notify all channels associated with the relevant `Product Area: *` label per issue
  const notifications = constructSlackMessage(channelToIssuesMap, now);
  // Do all this in parallel and wait till all finish
  await Promise.all(notifications);
};
