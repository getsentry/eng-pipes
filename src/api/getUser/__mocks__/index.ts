export const getUser = jest.fn((args) => {
  if (args) {
    if (
      args.email === 'test@sentry.io' ||
      args.slackUser === 'U018H4DA8N5' ||
      args.githubUser === 'githubUser'
    ) {
      return {
        email: 'test@sentry.io',
        slackUser: 'U018H4DA8N5',
        githubUser: 'githubUser',
      };
    }
  }
  return null;
});
