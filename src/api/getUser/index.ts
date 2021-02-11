import { bolt, web2 } from '@api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '@app/config';
import { db } from '@utils/db';

type GetUserParams = {
  email?: string;
  slack?: string;
  github?: string;
};

/**
 * Attempts to fetches a user based on one of the following params
 * - email
 * - slack user id
 * - github login name
 *
 * If user is not found in local database:
 * - search slack via `email`
 * - use slack's profile field for `GitHub Profile`
 *  - or, if a `github` param was passed, use that
 */
export async function getUser({
  email,
  slack: slackUser,
  github: githubUser,
}: GetUserParams) {
  const whereQuery = Object.fromEntries(
    Object.entries({
      email,
      slackUser,
      githubUser,
    }).filter(([, v]) => v)
  );

  const hasUser = await db('users').where(whereQuery).first('*');

  if (hasUser) {
    return hasUser;
  }

  // If not found in db then we need to lookup the user via email and save to db
  // Only supporting email because it seems unlikely you're looking up by slack id or github username
  if (!email) {
    return null;
  }

  // First fetch slack user
  const userResult: any = await bolt.client.users.lookupByEmail({
    email,
  });

  if (!userResult.ok) {
    return null;
  }

  // Check for github profile field in slack
  const profileResult: any = await web2.users.profile.get({
    user: userResult.user.id,
  });

  const githubLogin =
    profileResult.ok && profileResult.profile.fields[SLACK_PROFILE_ID_GITHUB];

  const userObject = {
    email,
    slackUser: userResult.user.id,
    githubUser: githubLogin?.value || githubUser,
  };

  await db('users').insert(userObject);

  return userObject;
}
