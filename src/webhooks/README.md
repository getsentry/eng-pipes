# Webhooks

* Webhooks in "production" are deployed to a Google Cloud Run instance, in the project `super-big-data`. Why? (TODO insert why)
* The webhook points to `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app`

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

## Generic Event Notifier

Handlers in the folder `notifier` can be used to send messages to be sent to Sentry Slack channels.
