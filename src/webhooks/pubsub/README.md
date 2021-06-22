# Google PubSub Handler

This handler will be [tied to a Google PubSub topic][pubsub] to receive paylods and then process them.

Currently, the only available type is `stale-triage-notifier` with a payload in the following shape:

```ts
type PubSubPayload = {
  name: string;
  slo?: number;
  repos?: string[];
};
```

This payload will be sent regularly using the [Cloud Scheduler][cloud_scheduler]
to notify teams about their issues pending triage over [our SLO][process_doc].

[pubsub]: https://cloud.google.com/run/docs/tutorials/pubsub#integrating-pubsub
[cloud_scheduler]: https://cloud.google.com/scheduler/docs/tut-pub-sub#create_a_job
[process_doc]: https://www.notion.so/sentry/Engaging-Customers-177c77ac473e41eabe9ca7b4bf537537#9d7b15dec9c345618b9195fb5c785e53