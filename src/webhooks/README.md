# Webhooks

* Webhooks in "production" are deployed to a Google Cloud Run instance, in the project `super-big-data`. Why? (TODO insert why)
* The webhook points to `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app`

## Generic Event Notifier

The folder `generic-notifier` provides a generic webhook which can be used to send messages to Sentry Slack channels and Sentry Datadog.

Simply, go to `@/config/secrets.ts` and add an entry to the `EVENT_NOTIFIER_SECRETS` object. This entry should contain a mapping from the source of the message (for example, `example-service`) to an environment variable. As of now, you will also need to edit `bin/deploy.sh` to add the new secret to the deployment and also add the secret to Google Secret Manager. Make a PR with this change and get it approved & merged.

Once this has been deployed, all you have to do is send a POST request to `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app/event-notifier/v1` with a JSON payload in the format of the type `GenericEvent` defined in `@/types/index.ts`. Currently, only Datadog and Slack messages are supported. Example:

```json
{
 "source": "example-service", // This must match the mapping string you define in the EVENT_NOTIFIER_SECRETS obj
 "timestamp": 0,
 "data": [
  {
   "type": "slack", // Basic Slack message
   "text": "Random text here", 
   "channels": ["#aaaaaa"],
   // Optionally, include Slack Blocks
   "blocks": []
  }, {
   "type": "service_notification", // Slack message using service registry information
   "service_name": "eng_pipes_gh_notifications", 
   "text": "Random text here",
   // Optionally, include Slack Blocks
   "blocks": []
  }, {
   "type": "datadog", // Datadog message
   "title": "This is an Example Notification",
   "text": "Random text here",
   "tags": ["source:example-service", "sentry-region:all", "sentry-user:bob"],
   "alertType": "info"
  }
 ]
}
```

Additionally, you must compute the HMAC SHA256 hash of the raw payload string computed with the secret key, and attach it to the `Authorization` header. EX: `Authorization: <Hash here>`

TODO: Add the service registry configs to the deployed instance & replace the current dummy json at `@/service-registry/service_registry.json` with the actual service registry json.

## Adding a webhook to GoCD event emitter

* goto [gocd](deploy.getsentry.net)
* goto `admin` then `plugins`
* find the `WebHook Notifier`
* expand the text box by dragging the bottom right
* add your URL

## Creating a new webhook

To create a new webhook, first create a new folder in this directory level with a name for the webhook. Next, create an `index.ts` file within this folder.

Within this file, export a function with a unique name for the webhook that implements this function header: `export async function webhookName(request: FastifyRequest, reply: FastifyReply)`

Finally, in the `index.ts` file at the same level as this README, import the function and add the following code to the `routeHandlers` function (adapting as needed):

```ts
server.post('/webhook/route/here', (request, reply) =>
handleRoute(webhookName, request, reply)
);
```

Make sure to write the appropriate tests for the new webhook as well, by creating a test file with the file path `.test.ts` in the same location.

## Authentication

Auth is handled via HMAC SHA256 signing. Each webhook expects a HMAC SHA hash sent in the `x-` header. Requests are validated by locally computing the expected HMAC SHA hash using a local secret (from an env variable) and comparing the values. `@/utils/auth/extractAndVerifySignature.ts` provides a utility function for authenticating requests.
