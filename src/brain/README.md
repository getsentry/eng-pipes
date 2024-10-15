# brain

The brain contains modules that listen to webhook events from GitHub, Slack, and GoCD. These modules are loaded in `@/utils/loadBrain`.

These files are intended to contain listeners for Slack, GoCD, and Github events which are received via HTTP webhooks and emitted as events.

## Code Structure

There are high level directories in brain: `github`, `gocd`, and `slack`. Each of these subdirectories contain handlers which listen to their respective events that are received from the upstream source.

| Directory           | Source                 | Purpose             |
| ------------------- | ---------------------- | ----------------------------------------------|
| `github`            | Github (getsentry org) | Listen to events on the getsentry org and performs helper tasks |
| `gocd`              | GoCD                   | Listens to deployments via a webhook and send notifications to Slack channels & Datadog |
| `slack`             | Slack (interactivity)  | Listens to updated events from Slack and handles events accordingly |

## Development

To create a new brain module / handler, either create a new folder inside one of the pre-existing categories: `github`, `gocd`, and `slack`; or, create a new category (if you are adding a new upstream source) and create a folder inside there.

Within this folder, titled `exampleHandler` for example, you must create an `index.ts` file that exports a function with the same name as the folder. For example: `export async function exampleHandler(){}`. This rule is to ensure that every folder is actively being used as a handler, and that code is deleted after deprecation.

Next, import the function `exampleHandler` in `@/utils/loadBrain.ts` and add it to the `loadFunctions` array. This will automatically load the handler upon server startup. By default, these functions don't support function arguments.

Additionally, you must update the list of handlers in `@/utils/loadBrain.test.ts` in order to pass CI.
