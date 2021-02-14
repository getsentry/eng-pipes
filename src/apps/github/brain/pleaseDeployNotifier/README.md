# pleaseDeployNotifier

Listens to GitHub `check_run` webhook and attempts to lookup the author of the commit. This can be a `sentry` OR `getsentry` commit. We lookup the getsentry bot commits that reference a `sentry` commit. We attempt to associate the author with a slack user (via commit author email <-> slack e-mail). If found, this messages the user when their commit is ready to be deployed.

This message also has a button to mute further notifications.


