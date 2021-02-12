import { findUser } from './findUser';
import { db } from '.';

type GetUserParams = Parameters<typeof findUser>[0];

/**
 * Retrieves user + preferences
 */
export async function getUserPreferences(args: GetUserParams) {
  return await findUser(args)
    .join('user_preferences', 'users.id', '=', 'user_preferences.userId')
    .first('*');
}
