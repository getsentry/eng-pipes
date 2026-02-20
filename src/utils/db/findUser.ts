import { db } from '@utils/db';

type GetUserParams = {
  email?: string;
  slackUser?: string;
  githubUser?: string;
};

/**
 * Queries for a user by:
 * - email
 * - slack user id
 * - github login name
 *
 * Note this does not return a result, you should will need to await the promise
 */
export function findUser({ email, slackUser, githubUser }: GetUserParams) {
  // Guard: return empty result if no valid search params to prevent
  // querying all users with empty WHERE clause
  if (!email && !slackUser && !githubUser) {
    return db('users').whereRaw('1 = 0');
  }

  const whereQuery = Object.fromEntries(
    Object.entries({
      email,
      slackUser,
    }).filter(([, v]) => v)
  );

  let query = db('users').where(whereQuery);

  if (typeof githubUser !== 'undefined') {
    query = query.where(
      db.raw('lower("githubUser") = ?', githubUser.toLowerCase())
    );
  }

  return query;
}
