import { KnownBlock } from '@slack/types';

import { ReposGetCommit } from '@types';

/**
 * Use a GitHub commit object and turn it to a pretty slack message
 */
export function getBlocksForCommit(
  commit: ReposGetCommit | null
): KnownBlock[] {
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

  const authorName =
    commit.commit.author?.name || commit.commit.author?.email || 'Unknown';
  const login = commit.author?.login;
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
          alt_text: authorName,
        },
        {
          type: 'mrkdwn',
          text: `<${commit.author?.html_url}|${authorName}${
            login ? ` (${login})` : ''
          }>`,
        },
      ],
    },
  ];

  return commitBlocks;
}
