import { client, v1 } from '@datadog/datadog-api-client';

export function loadDatadogApiInstance(env) {
  const configurationOpts = {
    authMethods: {
      apiKeyAuth: env.DD_API_KEY,
      appKeyAuth: env.DD_APP_KEY,
    },
    enableRetry: true,
  };

  const configuration = client.createConfiguration(configurationOpts);
  return new v1.EventsApi(configuration);
}
