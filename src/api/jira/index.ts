import JiraApi from 'jira-client';

const jira = new JiraApi({
  protocol: 'https',
  host: 'jira.somehost.com',
  username: 'username',
  password: 'password',
  apiVersion: '2',
  strictSSL: true,
});

jira.addAttachmentOnIssue;
