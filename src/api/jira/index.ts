import JiraApi from 'jira-client';

import { JIRA_ACCOUNT, JIRA_API_TOKEN } from '@/config';

export const jira = new JiraApi({
  protocol: 'https',
  host: 'https://getsentry.atlassian.net',
  username: JIRA_ACCOUNT,
  password: JIRA_API_TOKEN,
  apiVersion: '2',
  strictSSL: true,
});
