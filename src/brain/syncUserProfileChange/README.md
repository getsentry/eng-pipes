# syncUserProfileChange

This event is triggered when users change their Slack user profiles. When this happens, we need to check to see if they changed the GitHub profile field, and if so, sync the changes to the db.

Note that our slack has users outside of the company and we need to make sure that these users are ignored. We mostly rely on the e-mail address of the user.
