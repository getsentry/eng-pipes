# Google Cron Job Handler

Files in this subdirectory contain code for webhooks which trigger cron jobs. They are ran by Cloud Scheduler.

One of the available cron jobs is `stale-triage-notifier` (defined in `slackNotificaitons.ts`) with a payload in the following shape:

```ts
type PubSubPayload = {
  name: string;
  slo?: number;
  repos?: string[];
};
```

This payload will be sent regularly using the [Cloud Scheduler][cloud_scheduler]
to notify product owners about their issues pending triage over [our SLO][process_doc].

[cloud_scheduler]: https://cloud.google.com/scheduler/docs/tut-pub-sub#create_a_job
[process_doc]: https://www.notion.so/sentry/Engaging-Customers-177c77ac473e41eabe9ca7b4bf537537#9d7b15dec9c345618b9195fb5c785e53

## List of all Cron Jobs

| Job Name                         | Route                            | Files                             |
| -------------------------------- | -------------------------------- | --------------------------------- |
| `stale-triage-notifier`          | `/jobs/stale-triage-notifier`    | `slackNotifications.ts`           |
| `stale-bot`                      | `/jobs/stale-bot`                | `stalebot.ts`                     |
| `slack-scores`                   | `/jobs/slack-scores`             | `slackScores.ts`                  |
| `gocd-paused-pipeline-bot`       | `/jobs/gocd-paused-pipeline-bot` | `gocdPausedPipelineBot.ts`        |

## Development

To add a new cron job:

* Create a unique file in this subdirectory
* In this file, export a function:

```ts
export async function cronJobName(
  org: GitHubOrg,
  now: moment.Moment
){}
```

(`org` and `now` are are used for some reason by all of the other cron jobs, but you can just rename them to `_org` and `_now`)
This function should run logic a single time when it is called.

* In `index.ts`, import the function and add the following code to the `routeJobs` function:

```ts
server.post('/cron-job-path', (request, reply) =>
  handleJobRoute(cronJobName, request, reply)
);
```

By default, the actual job route will appear with `/jobs/` prepended to the route, so for example: `https://product-eng-webhooks-vmrqv3f7nq-uw.a.run.app/jobs/cron-job-path`
