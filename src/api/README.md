# APIs

This folder contains various APIs and initialized code for use throughout the project.

`github` contains initialization code for octokit. Use via `import { githubEvents } from '@/api/github';`

`gocd` contains initialization code for an event emitter which listens to gocd events. Use via `import { gocdevents } from '@/api/gocd/gocdEventEmitter';`

`slack` contains initialization code for Slack bolt. Use via `import { bolt } from '@/api/slack';`

These APIs are to be used for communicating with downstream channels. To use them in the project, simply import them.

To add a new API, simply create a new folder in this and import files elsewhere.
