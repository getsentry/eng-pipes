# Google Cron Job Handler

Files in this subdirectory contain code for webhooks which trigger cron jobs. They are ran by Cloud Scheduler.

## List of all Cron Jobs

| Job Name                         | Route                            | Files                             |
| -------------------------------- | -------------------------------- | --------------------------------- |
| `stale-triage-notifier`          | `/jobs/stale-triage-notifier`    | `slackNotifications.ts`           |
| `stale-bot`                      | `/jobs/stale-bot`                | `stalebot.ts`                     |
| `slack-scores`                   | `/jobs/slack-scores`             | `slackScores.ts`                  |
| `gocd-paused-pipeline-bot`       | `/jobs/gocd-paused-pipeline-bot` | `gocdPausedPipelineBot.ts`        |
| `heartbeat`                      | `/jobs/heartbeat`                | `heartbeat.ts`                    |

## Development

To add a new cron job:

* Create a new folder in this subdirectory
* In this folder, create a file
* In this file, export a function:

```ts
export async function cronJobName(
  org: GitHubOrg,
  now: moment.Moment
){}
```

or

```ts
export async function cronJobName(){}
```

Depending on if your job is a Github-related job, or a generic cron job. This function should run logic a single time when it is called.

* In `index.ts`, import the function and add the following code to the `routeJobs` function:

```ts
server.post('/cron-job-path', (request, reply) =>
  handleGithubJobs(cronJobName, request, reply)
);
```

or

```ts
server.post('/cron-job-path', (request, reply) =>
  handleCronJobs(cronJobName, request, reply)
);
```

By default, the actual job route will appear with `/jobs/` prepended to the route, so for example: `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app/jobs/cron-job-path`

## Authentication

Since jobs are triggered via Cloud Scheduler, we use Google's built in JWT OIDC tokens for authentication. We use `{ OAuth2Client } from 'google-auth-library'` to validate incoming HTTP requests to all of the job endpoints.
