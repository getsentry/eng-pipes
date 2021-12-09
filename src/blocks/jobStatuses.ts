import { Annotation } from '@/types';

/**
 * Transform GitHub Markdown link to Slack link
 */
function githubMdToSlack(str: string) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/;
  const matches = str.match(pattern);
  if (matches) {
    return `<${matches[2]}|${matches[1]}>`;
  }

  return str;
}

export function jobStatuses(
  jobs: string[][],
  annotations: Record<string, Annotation[]>
) {
  // Create slack block for each job (and for each job, an annotation if it
  // exists). This returns an array of arrays so we will need to concat + spread
  // to get the proper data structure
  const jobsList = jobs.map(([jobName, conclusion]) => [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${githubMdToSlack(jobName)} - ${conclusion}`,
        },
      ],
    },
    ...(annotations[jobName]
      ? annotations[jobName].map((annotation) => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\`\`\`
    <${annotation.blob_href}|${annotation.title}>
    ${annotation.message}
    \`\`\``,
          },
        }))
      : []),
  ]);

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Job Statuses',
        emoji: true,
      },
    },

    ...Array.prototype.concat(...jobsList),
  ];
}
