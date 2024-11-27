/*

This file contains secrets used for verifying incoming events from different HTTP sources.

*/

export const EVENT_NOTIFIER_SECRETS = {
  // Follow the pattern below to add a new secret
  // The secret will also need to be added in the deploy.sh script and in
  // Google Secret manager
  // 'example-service': process.env.EXAMPLE_SERVICE_SECRET,
};
if (process.env.ENV !== 'production')
  EVENT_NOTIFIER_SECRETS['example-service'] =
    process.env.EXAMPLE_SERVICE_SECRET;
