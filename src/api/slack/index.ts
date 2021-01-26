import { WebClient } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';

const token = process.env.SLACK_ACCESS_TOKEN || '';
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET || '';

const slackEvents = createEventAdapter(slackSigningSecret);
const web = new WebClient(token);

export { web, slackEvents };
