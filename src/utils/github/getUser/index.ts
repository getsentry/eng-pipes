import * as Sentry from '@sentry/node';

import { SLACK_PROFILE_ID_GITHUB } from '@/config';
import { normalizeGithubUser } from '@/utils/github/normalizeGithubUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { findUser } from '@utils/db/findUser';
import { isSentrySlackUser } from '@utils/isSentrySlackUser';

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
  if (process.env.FORCE_GET_USER_BY_SLACK_ID) {
    console.warn(
      'Overriding getUser() with slack user ID:',
      process.env.FORCE_GET_USER_BY_SLACK_ID
    );
    slackUser = process.env.FORCE_GET_USER_BY_SLACK_ID;
    email = undefined;
    githubUser = undefined;
  }

  // Only allow looking up via `@sentry.io` emails
  if (email && !email.endsWith('@sentry.io')) {
    email = undefined;
  }

  const hasUser = await findUser({ email, slackUser, githubUser }).first('*');

  if (hasUser) {
    return hasUser;
  }

  // If not found in db then we need to lookup the user via email or slack username and save to db
  if (!email && !slackUser) {
    return null;
  }

  let userResult: any;

  if (email) {
    try {
      // First fetch slack user
      userResult = await bolt.client.users.lookupByEmail({
        email,
      });
    } catch (err) {
      // TODO(billy); should probably only explicitly ignore when a user is not found
      console.error(err);
    }
  } else if (slackUser) {
    userResult = await bolt.client.users.info({
      user: slackUser,
    });
  }

  // Do not insert into db if user has not confirmed email, or if they are deleted
  if (userResult && !isSentrySlackUser(userResult.user)) {
    return null;
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
    profileResult?.profile.fields?.[SLACK_PROFILE_ID_GITHUB]?.value;

  const userObject = {
    email: email || userResult?.user.profile.email,
    slackUser: slackUser || userResult?.user.id,
    // trust githubUser input since it should be coming from github, and not user input
    githubUser: normalizeGithubUser(githubUser || githubLogin),
  };

  return await db.transaction(async (trx) => {
    const rows = await db('users')
      .insert(userObject)
      .onConflict(['email'])
      .merge()
      .returning('*')
      .transacting(trx);
    return rows?.[0];
  });
}
