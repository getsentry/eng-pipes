// Description:
//   Interact with the Freight deploy service.
//
// Configuration:
//   FREIGHT_URL
//   FREIGHT_API_KEY
import axios from 'axios';

import { FREIGHT_API_KEY, FREIGHT_URL } from '@/config';
import { bolt } from '@api/slack';

const apiInstance = axios.create({
  baseURL: FREIGHT_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Key ${FREIGHT_API_KEY}`,
  },
});

type FreightParams = {
  /**
   * The slack user ID who initiated the deploy. Will be used to verify they are
   * a slack member and they have a sentry email address.
   */
  user: string;

  /**
   * The application name to deploy
   */
  app: string;

  /**
   * The git ref to deploy
   */
  ref?: string;

  /**
   * The environment to deploy to
   */
  env?: string;
};

// Check that the user is in slack, and has a sentry.io e-mail
async function allowUser(slackUserId: string) {
  try {
    const resp = await bolt.client.users.info({ user: slackUserId });
    const user: any = resp.user;

    if (
      !user ||
      !user.endsWith('@sentry.io') ||
      user.deleted ||
      !user.is_email_confirmed
    ) {
      throw new Error('Unauthorized user');
    }
    return user.profile.email;
  } catch (err) {
    throw new Error('Error authorizing user');
  }
}

export async function deployRevision({
  ref,
  env,
  user: slackUser,
  app,
}: FreightParams) {
  const user = await allowUser(slackUser);
  const data = {
    ref,
    env,
    user,
    app,
  };

  return await apiInstance.post('/tasks/', data);
}

export async function rollback({
  env,
  user: slackUser,
  app,
}: Omit<FreightParams, 'ref'>) {
  const user = await allowUser(slackUser);
  const data = {
    ref: ':previous',
    env,
    user,
    app,
  };

  return await apiInstance.post('/tasks/', data);
}
export async function cancelDeploy({
  app,
  env,
  user: slackUser,
  freightId,
}: Pick<FreightParams, 'app' | 'env' | 'user'> & { freightId: number }) {
  await allowUser(slackUser);
  const data = {
    status: 'cancelled',
  };

  return await apiInstance.put(`/tasks/${app}/${env}/${freightId}/`, data);
}
