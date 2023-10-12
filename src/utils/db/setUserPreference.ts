import * as Sentry from '@sentry/node';

import { findUser } from './findUser';
import { db } from '.';

import { getUser } from '~/api/getUser';

type GetUserParams = Parameters<typeof findUser>[0];

/**
 * Retrieves user + preferences
 */
export async function setUserPreference(
  args: GetUserParams,
  preferences: Record<string, any>
) {
  const user = await getUser(args);
  if (!user) {
    return false;
  }
  try {
    await db('users')
      .where({
        id: user.id,
      })
      .update({
        // @ts-ignore
        preferences: db.raw(`preferences || ?`, [preferences]),
      });
    return true;
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
    return false;
  }
}
