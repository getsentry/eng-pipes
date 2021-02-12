import * as Sentry from '@sentry/node';

import { bolt } from '@api/slack';
import { SLACK_PROFILE_ID_GITHUB } from '@app/config';
import { db } from '@utils/db';
import { findUser } from '@utils/db/findUser';

type GetUserParams = Parameters<typeof findUser>[0];

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
export async function getUser({ email, slackUser, githubUser }: GetUserParams) {
  const hasUser = await findUser({ email, slackUser, githubUser }).first('*');

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
    console.error(err);
  }

  // Check for github profile field in slack
  let profileResult: any;

  if (userResult?.ok && userResult?.user) {
    try {
      profileResult = await bolt.client.users.profile.get({
        user: userResult?.user.id,
      });
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  // Some people have the full URL in their slack profile
  const githubLogin =
    profileResult?.ok &&
    !githubUser &&
    profileResult?.profile.fields[SLACK_PROFILE_ID_GITHUB]?.value.replace(
      'https://github.com/',
      ''
    );

  const userObject = {
    email,
    slackUser: userResult?.user.id,
    // trust githubUser input since it should be coming from github, and not user input
    githubUser: githubUser || githubLogin,
  };

  try {
    await db('users').insert(userObject).onConflict(['email']).merge();
  } catch (err) {
    // Shouldn't have duplicates... but maybe this happens if `githubUser` does not match slack profile value?
    Sentry.captureException(err);
    console.error(err);
  }

  return userObject;
}
