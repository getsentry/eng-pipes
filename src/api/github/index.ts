import { Webhooks } from '@octokit/webhooks';

const githubEvents = new Webhooks({
  secret: process.env.GH_WEBHOOK_SECRET,
});

export { githubEvents };
