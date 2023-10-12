import { KnownBlock } from '@slack/types';

import { getUser } from '../getUser';

import { ReposGetCommit } from '~/src/types';

type Options = {
  shouldSlackMention?: boolean;
};

/**
 * Use a GitHub commit object and turn it to a pretty slack message
 */
export async function getBlocksForCommit(
  commit: ReposGetCommit | null,
  { shouldSlackMention }: Options = {}
): Promise<KnownBlock[]> {
  if (!commit) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Unable to fetch relevant commit`,
        },
      },
    ];
  }

  const [commitTitle, ...commitBodyLines] = commit.commit.message.split('\n');

  const login = commit.author?.login;
  const user =
    shouldSlackMention && login ? await getUser({ githubUser: login }) : null;
  const displayName =
    commit.commit.author?.name || commit.commit.author?.email || 'Unknown';

  // If slack user was found, @-mention them, otherwise, link to GH profile
  const authorName = user?.slackUser
    ? `<@${user.slackUser}>`
    : `<${commit.author?.html_url}|${displayName}${
        login ? ` (${login})` : ''
      }>`;
  const avatarUrl = commit.author?.avatar_url || '';

  // Slack API will error if this is empty, We could leave this out, but why not try
  // to shame people?
  const commitBody =
    commitBodyLines.filter(Boolean).join('\n') || '_<empty commit message>_';

  const commitBlocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${commit.html_url}|*${commitTitle}*>`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: commitBody,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'image',
          image_url: avatarUrl,
          alt_text: displayName,
        },
        {
          type: 'mrkdwn',
          text: authorName,
        },
      ],
    },
  ];

  return commitBlocks;
}
