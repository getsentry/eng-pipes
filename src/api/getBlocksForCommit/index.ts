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

  const [commitTitle, ...commitBody] = commit.commit.message.split('\n');

  const authorName =
    commit.commit.author?.name || commit.commit.author?.email || 'Unknown';
  const login = commit.author?.login;
  const avatarUrl = commit.author?.avatar_url || '';

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
        text: commitBody.filter(Boolean).join('\n'),
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
