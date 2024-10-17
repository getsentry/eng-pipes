# Stale Triage Notifier

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
