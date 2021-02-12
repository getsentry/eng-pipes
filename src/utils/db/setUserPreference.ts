import * as Sentry from '@sentry/node';

import { getUser } from '@api/getUser';

import { findUser } from './findUser';
import { db } from '.';

type GetUserParams = Parameters<typeof findUser>[0];

/**
 * Retrieves user + preferences
 */
export async function setUserPreference(
  args: GetUserParams,
  preferences: Record<string, boolean | string | number>
) {
  const user = await getUser(args);
  if (!user) {
    return false;
  }
  try {
    await db.raw(
      `UPDATE user_preferences SET preferences = preferences || ? WHERE "userId" = ?`,
      [JSON.stringify(preferences), user.id]
    );
    return true;
  } catch (err) {
    Sentry.captureException(err);
    return false;
  }
}
