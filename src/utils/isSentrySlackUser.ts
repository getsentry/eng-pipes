// This is incomplete
type SlackUser = {
  id: string;
  profile: {
    email?: string;
  };
  is_email_confirmed?: boolean;
  deleted?: boolean;
  is_restricted?: boolean;
  is_ultra_restricted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
};

/**
 * Ensures that a Slack user is a Sentry employee.
 *
 * We do explicit boolean checks here because some of these fields seem to be optional from Slack
 */
export function isSentrySlackUser(user: SlackUser) {
  return (
    user.profile?.email?.endsWith('@sentry.io') &&
    !(
      // Via Slack:
      // Since you're using SSO, the email isn't actually confirmed since the login
      // credentials are actually tied to the SSO service rather than the email address.
      // This means that the is_email_confirmed field won't reveal any useful information for you.
      (
        user.deleted === true ||
        user.is_restricted === true ||
        user.is_ultra_restricted === true ||
        user.is_bot === true ||
        user.is_app_user === true
      )
    )
  );
}
