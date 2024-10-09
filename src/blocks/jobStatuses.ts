import { Annotation } from '@/types/github';

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

function getIcon(annotation: Annotation) {
  const { annotation_level: level } = annotation;

  if (level === 'warning') {
    return '⚠️';
  } else if (level === 'failure') {
    return '🚫';
  }

  return '';
}

export function jobStatuses(
  jobs: string[][],
  annotations: Record<string, Annotation[]>
) {
  // Create slack block for each job (and for each job, an annotation if it
  // exists). This returns an array of arrays so we will need to concat + spread
  // to get the proper data structure
  const jobsList = jobs.flatMap(([jobName, conclusion]) => [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${githubMdToSlack(jobName)} - ${conclusion}`,
      },
    },
    ...(annotations[jobName]
      ? annotations[jobName].flatMap((annotation) => [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `${getIcon(annotation)} ${
                  annotation.annotation_level
                } - <${annotation.blob_href}|${annotation.title}>`,
              },
              {
                type: 'mrkdwn',
                text: `\`\`\`
    ${annotation.message}
    \`\`\``,
              },
            ],
          },
        ])
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
    ...jobsList,
  ];
}
