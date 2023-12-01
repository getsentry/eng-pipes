# brain

The brain contains modules that listen to webhook events from GitHub, Slack, and GoCD. These modules are autoloaded by `@utils/loadBrain`.

(note) in order for load brain to load your function, it must be in a `index.ts` file and the name of the loading function must match that of your new directory. Ex: `gocdSlackFeeds/`, folder has `index.ts` with `export async function gocdSlackFeeds()`

## Webhooks deployment

* Webhooks in "production" are deployed to a Google Cloud Run instance, in the project `super-big-data`. Why? (TODO insert why)
* The webhook points to `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app`

## Adding a webhook to GoCD event emitter

* goto [gocd](deploy.getsentry.net)
* goto `admin` then `plugins`
* find the `WebHook Notifier`
* expand the text box by dragging the bottom right
* Add your URL
