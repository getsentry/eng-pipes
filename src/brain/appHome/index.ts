import { getUser } from '~/src/api/getUser';
import { bolt } from '~/src/api/slack';
import { updateAppHome } from '~/src/api/slack/updateAppHome';
import { db } from '~/src/utils/db';
import { normalizeGithubUser } from '~/src/utils/normalizeGithubUser';

export function appHome() {
  // User used App Home to set GitHub login
  bolt.action('set-github-login', async ({ ack, body, payload }) => {
    ack();
    // @ts-ignore
    const submittedUsername = normalizeGithubUser(payload.value);
    // If user does not yet exist, this will save a new user with slack + github
    const user = await getUser({
      slackUser: body.user.id,
      githubUser: submittedUsername,
    });

    // User already existed in db, link their GH username
    if (user && !user.githubUser) {
      await db('users')
        .where({ id: user.id })
        .update({ githubUser: submittedUsername });
    }
    updateAppHome(body.user.id);
  });

  // Listen for users opening your App Home
  bolt.event('app_home_opened', async ({ event }) => {
    updateAppHome(event.user);
  });
}
