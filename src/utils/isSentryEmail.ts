export function isSentryEmail(email?: string): boolean {
  return email !== undefined && email.endsWith('@sentry.io');
}
