const KNOWN_BOTS = [
  // https://www.notion.so/sentry/Bot-Accounts-beea0fc35473453ab50e05e6e4d1d02d
  'getsentry-bot',
  'getsentry-release',
  'sentry-test-fixture-nonmember',
];

export async function isFromABot(payload) {
  return (
    KNOWN_BOTS.includes(payload.sender.login) ||
    payload.sender.login.endsWith('[bot]')
  );
}
