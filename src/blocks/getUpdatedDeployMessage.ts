import { FreightPayload } from '@types';

/**
 * Constructs a message for the status of a deploy
 */
export function getUpdatedDeployMessage({
  isUserDeploying,
  payload,
}: {
  isUserDeploying: boolean;
  payload: Pick<
    FreightPayload,
    'deploy_number' | 'status' | 'user' | 'duration' | 'link' | 'title'
  >;
}) {
  const { deploy_number, status, user, duration, link, title } = payload;
  // You have, user has
  const verbByStatus = {
    true: {
      queued: 'You have',
      started: 'You are',
      finished: 'You have',
    },
    false: {
      queued: `${user} has`,
      started: `${user} is`,
      finished: `${user} has`,
    },
  };

  const subject =
    verbByStatus[`${!!isUserDeploying}`][status] ??
    // Otherwise it has failed
    (isUserDeploying ? `You have` : `${user} has`);

  const slackLink = `<${link}|#${deploy_number}>`;

  if (status === 'queued') {
    return `${subject} queued this commit for deployment (${slackLink})`;
  }

  if (status === 'started') {
    return `${subject} deploying this commit (${slackLink})`;
  }

  if (status === 'finished') {
    return `${subject} finished deploying this commit (${slackLink}) after ${duration} seconds`;
  }

  // Otherwise it failed to deploy, show the Freight summary
  return `${subject} failed to deploy this commit (${slackLink})

> ${title}
`;
}
