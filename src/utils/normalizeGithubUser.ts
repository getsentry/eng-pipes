/**
 * This normalizes a GitHub Username from the Slack profile field.
 *
 * Because it's a Slack custom profile field, people can input their profiles
 * in a number of ways including:
 *
 * - just the username
 * - full URL
 * - partial URL without the protocol
 * - probably more?
 *
 * This strips the protocol and/or host name (github.com)
 */
export function normalizeGithubUser(user?: string) {
  return user?.replace(/(https?:\/\/|)github.com\//, '');
}
