import { client, v1 } from '@datadog/datadog-api-client';

function loadDatadogConfiguration(env) {
  const configurationOpts = {
    authMethods: {
      apiKeyAuth: env.DD_API_KEY,
      appKeyAuth: env.DD_APP_KEY,
    },
    enableRetry: true,
  };

  return client.createConfiguration(configurationOpts);
}

export function loadDatadogApiInstance(env): v1.EventsApi {
  const configuration = loadDatadogConfiguration(env);
  return new v1.EventsApi(configuration);
}

export function loadDatadogApiMetricsInstance(env): v1.MetricsApi {
  const configuration = loadDatadogConfiguration(env);
  return new v1.MetricsApi(configuration);
}
