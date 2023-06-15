// Derived from GitHub's docs:
//
//   https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#webhook-payload-example-when-someone-edits-an-issue.

export default {
  action: 'edited',
  projects_v2_item: {
    id: 28937214,
    node_id: 'test-node-id',
    project_node_id: 'test-project-node-id',
    content_node_id: 'test-content-node-id',
    content_type: 'Issue',
    creator: {
      login: 'getsantry-bot[bot]',
      id: 112652482,
      node_id: 'bot-node-id',
      avatar_url: 'https://avatars.githubusercontent.com/u/121066737?v=4',
      gravatar_id: '',
      url: 'https://api.github.com/users/getsantry-bot%5Bbot%5D',
      html_url: 'https://github.com/apps/getsantry-bot',
      followers_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/followers',
      following_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/following{/other_user}',
      gists_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/gists{/gist_id}',
      starred_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/starred{/owner}{/repo}',
      subscriptions_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/subscriptions',
      organizations_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/orgs',
      repos_url: 'https://api.github.com/users/getsantry-bot%5Bbot%5D/repos',
      events_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/events{/privacy}',
      received_events_url:
        'https://api.github.com/users/getsantry-bot%5Bbot%5D/received_events',
      type: 'Bot',
      site_admin: false,
    },
    created_at: '2023-05-23T16:24:12Z',
    updated_at: '2023-05-25T23:51:06Z',
    archived_at: null,
  },
  changes: {
    field_value: {
      field_node_id: 'field-id',
      field_type: 'single_select',
    },
  },
  organization: {
    login: 'test-org',
    id: 121066737,
    node_id: 'O_kgDMBzdU8Q',
    url: 'https://api.github.com/orgs/test-org',
    repos_url: 'https://api.github.com/orgs/test-org/repos',
    events_url: 'https://api.github.com/orgs/test-org/events',
    hooks_url: 'https://api.github.com/orgs/test-org/hooks',
    issues_url: 'https://api.github.com/orgs/test-org/issues',
    members_url: 'https://api.github.com/orgs/test-org/members{/member}',
    public_members_url:
      'https://api.github.com/orgs/test-org/public_members{/member}',
    avatar_url: 'https://avatars.githubusercontent.com/u/121066737?v=4',
    description: null,
  },
  sender: {
    login: 'Picard',
    id: 21031067,
    node_id: 'MDQ6VXNlcjIxMDMxMDY3',
    avatar_url: 'https://avatars1.githubusercontent.com/u/21031067?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/Picard',
    html_url: 'https://github.com/Picard',
    followers_url: 'https://api.github.com/users/Picard/followers',
    following_url: 'https://api.github.com/users/Picard/following{/other_user}',
    gists_url: 'https://api.github.com/users/Picard/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/Picard/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/Picard/subscriptions',
    organizations_url: 'https://api.github.com/users/Picard/orgs',
    repos_url: 'https://api.github.com/users/Picard/repos',
    events_url: 'https://api.github.com/users/Picard/events{/privacy}',
    received_events_url: 'https://api.github.com/users/Picard/received_events',
    type: 'User',
    site_admin: false,
  },
  installation: {
    id: 12321321,
    node_id: 'MDIzOkludGVncmK0aW9uSW5zdGFsbGF0aW9uMzcxMTgwNTE=',
  },
};
