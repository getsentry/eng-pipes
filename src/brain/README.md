# brain

The brain contains modules that listen to webhook events from GitHub, Slack, and GoCD. These modules are loaded in `@/utils/loadBrain`.

While loadBrain is able to load any listener via a direct import, to pass CI testing it must be in a `index.ts` file and the name of the loading function must match that of your new directory. Ex: `gocdSlackFeeds/`, folder has `index.ts` with `export async function gocdSlackFeeds()`

These files are intended to contain listeners for Slack, GoCD, and Github events which are received via HTTP webhooks and emitted as events.
