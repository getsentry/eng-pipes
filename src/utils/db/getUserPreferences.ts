import { findUser } from './findUser';

type GetUserParams = Parameters<typeof findUser>[0];

/**
 * Retrieves user + preferences
 */
export async function getUserPreferences(args: GetUserParams) {
  return await findUser(args).first('*');
}
