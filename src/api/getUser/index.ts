import * as Sentry from '@sentry/node';

import { bolt } from '@api/slack';
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

  let userResult: any;

  try {
    // First fetch slack user
    userResult = await bolt.client.users.lookupByEmail({
      email,
    });
  } catch (err) {
    // TODO(billy); should probably only explicitly ignore when a user is not found
  }

  // Check for github profile field in slack
  let profileResult: any;

  if (userResult?.ok && userResult?.user) {
    try {
      await bolt.client.users.profile.get({
        user: userResult?.user.id,
      });
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  const githubLogin =
    profileResult?.ok &&
    !githubUser &&
    profileResult?.profile.fields[SLACK_PROFILE_ID_GITHUB];

  const userObject = {
    email,
    slackUser: userResult?.user.id,
    // trust githubUser input since it should be coming from github, and not user input
    githubUser: githubUser || githubLogin?.value,
  };

  await db('users').insert(userObject);

  return userObject;
}
