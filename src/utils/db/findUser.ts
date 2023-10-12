import { db } from '~/src/utils/db';

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
  const whereQuery = Object.fromEntries(
    Object.entries({
      email,
      slackUser,
      githubUser,
    }).filter(([, v]) => v)
  );

  return db('users').where(whereQuery);
}
