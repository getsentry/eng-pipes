// Derived from GitHub's docs:
//
//   https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#webhook-payload-example-when-someone-edits-an-issue.

export default {
  action: 'opened',
  issue: {
    url: 'https://api.github.com/repos/getsentry/Hello-World/issues/1',
    repository_url: 'https://api.github.com/repos/getsentry/Hello-World',
    labels_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues/1/labels{/name}',
    comments_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues/1/comments',
    events_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues/1/events',
    html_url: 'https://github.com/getsentry/Hello-World/issues/1',
    id: 444500041,
    node_id: 'MDU6SXNzdWU0NDQ1MDAwNDE=',
    number: 1,
    title: 'Spelling error in the README file',
    user: {
      login: 'Picard',
      id: 21031067,
      node_id: 'MDQ6VXNlcjIxMDMxMDY3',
      avatar_url: 'https://avatars1.githubusercontent.com/u/21031067?v=4',
      gravatar_id: '',
      url: 'https://api.github.com/users/Picard',
      html_url: 'https://github.com/Picard',
      followers_url: 'https://api.github.com/users/Picard/followers',
      following_url:
        'https://api.github.com/users/Picard/following{/other_user}',
      gists_url: 'https://api.github.com/users/Picard/gists{/gist_id}',
      starred_url: 'https://api.github.com/users/Picard/starred{/owner}{/repo}',
      subscriptions_url: 'https://api.github.com/users/Picard/subscriptions',
      organizations_url: 'https://api.github.com/users/Picard/orgs',
      repos_url: 'https://api.github.com/users/Picard/repos',
      events_url: 'https://api.github.com/users/Picard/events{/privacy}',
      received_events_url:
        'https://api.github.com/users/Picard/received_events',
      type: 'User',
      site_admin: false,
    },
    labels: [
      {
        id: 1362934389,
        node_id: 'MDU6TGFiZWwxMzYyOTM0Mzg5',
        url: 'https://api.github.com/repos/getsentry/Hello-World/labels/bug',
        name: 'bug',
        color: 'd73a4a',
        default: true,
      },
    ],
    state: 'open',
    locked: false,
    assignee: null,
    assignees: [],
    milestone: null,
    comments: 0,
    created_at: '2019-05-15T15:20:18Z',
    updated_at: '2019-05-15T15:20:18Z',
    closed_at: null,
    author_association: 'GETSENTRY_ORG',
    body: "It looks like you accidently spelled 'commit' with two 't's.",
  },
  changes: {},
  repository: {
    id: 186853002,
    node_id: 'MDEwOlJlcG9zaXRvcnkxODY4NTMwMDI=',
    name: 'Hello-World',
    full_name: 'getsentry/Hello-World',
    private: false,
    owner: {
      login: 'getsentry',
      id: 21031067,
      node_id: 'MDQ6VXNlcjIxMDMxMDY3',
      avatar_url: 'https://avatars1.githubusercontent.com/u/21031067?v=4',
      gravatar_id: '',
      url: 'https://api.github.com/users/getsentry',
      html_url: 'https://github.com/getsentry',
      followers_url: 'https://api.github.com/users/getsentry/followers',
      following_url:
        'https://api.github.com/users/getsentry/following{/other_user}',
      gists_url: 'https://api.github.com/users/getsentry/gists{/gist_id}',
      starred_url:
        'https://api.github.com/users/getsentry/starred{/owner}{/repo}',
      subscriptions_url: 'https://api.github.com/users/getsentry/subscriptions',
      organizations_url: 'https://api.github.com/users/getsentry/orgs',
      repos_url: 'https://api.github.com/users/getsentry/repos',
      events_url: 'https://api.github.com/users/getsentry/events{/privacy}',
      received_events_url:
        'https://api.github.com/users/getsentry/received_events',
      type: 'Organization',
      site_admin: false,
    },
    html_url: 'https://github.com/getsentry/Hello-World',
    description: null,
    fork: false,
    url: 'https://api.github.com/repos/getsentry/Hello-World',
    forks_url: 'https://api.github.com/repos/getsentry/Hello-World/forks',
    keys_url:
      'https://api.github.com/repos/getsentry/Hello-World/keys{/key_id}',
    collaborators_url:
      'https://api.github.com/repos/getsentry/Hello-World/collaborators{/collaborator}',
    teams_url: 'https://api.github.com/repos/getsentry/Hello-World/teams',
    hooks_url: 'https://api.github.com/repos/getsentry/Hello-World/hooks',
    issue_events_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues/events{/number}',
    events_url: 'https://api.github.com/repos/getsentry/Hello-World/events',
    assignees_url:
      'https://api.github.com/repos/getsentry/Hello-World/assignees{/user}',
    branches_url:
      'https://api.github.com/repos/getsentry/Hello-World/branches{/branch}',
    tags_url: 'https://api.github.com/repos/getsentry/Hello-World/tags',
    blobs_url:
      'https://api.github.com/repos/getsentry/Hello-World/git/blobs{/sha}',
    git_tags_url:
      'https://api.github.com/repos/getsentry/Hello-World/git/tags{/sha}',
    git_refs_url:
      'https://api.github.com/repos/getsentry/Hello-World/git/refs{/sha}',
    trees_url:
      'https://api.github.com/repos/getsentry/Hello-World/git/trees{/sha}',
    statuses_url:
      'https://api.github.com/repos/getsentry/Hello-World/statuses/{sha}',
    languages_url:
      'https://api.github.com/repos/getsentry/Hello-World/languages',
    stargazers_url:
      'https://api.github.com/repos/getsentry/Hello-World/stargazers',
    contributors_url:
      'https://api.github.com/repos/getsentry/Hello-World/contributors',
    subscribers_url:
      'https://api.github.com/repos/getsentry/Hello-World/subscribers',
    subscription_url:
      'https://api.github.com/repos/getsentry/Hello-World/subscription',
    commits_url:
      'https://api.github.com/repos/getsentry/Hello-World/commits{/sha}',
    git_commits_url:
      'https://api.github.com/repos/getsentry/Hello-World/git/commits{/sha}',
    comments_url:
      'https://api.github.com/repos/getsentry/Hello-World/comments{/number}',
    issue_comment_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues/comments{/number}',
    contents_url:
      'https://api.github.com/repos/getsentry/Hello-World/contents/{+path}',
    compare_url:
      'https://api.github.com/repos/getsentry/Hello-World/compare/{base}...{head}',
    merges_url: 'https://api.github.com/repos/getsentry/Hello-World/merges',
    archive_url:
      'https://api.github.com/repos/getsentry/Hello-World/{archive_format}{/ref}',
    downloads_url:
      'https://api.github.com/repos/getsentry/Hello-World/downloads',
    issues_url:
      'https://api.github.com/repos/getsentry/Hello-World/issues{/number}',
    pulls_url:
      'https://api.github.com/repos/getsentry/Hello-World/pulls{/number}',
    milestones_url:
      'https://api.github.com/repos/getsentry/Hello-World/milestones{/number}',
    notifications_url:
      'https://api.github.com/repos/getsentry/Hello-World/notifications{?since,all,participating}',
    labels_url:
      'https://api.github.com/repos/getsentry/Hello-World/labels{/name}',
    releases_url:
      'https://api.github.com/repos/getsentry/Hello-World/releases{/id}',
    deployments_url:
      'https://api.github.com/repos/getsentry/Hello-World/deployments',
    created_at: '2019-05-15T15:19:25Z',
    updated_at: '2019-05-15T15:19:27Z',
    pushed_at: '2019-05-15T15:20:13Z',
    git_url: 'git://github.com/getsentry/Hello-World.git',
    ssh_url: 'git@github.com:getsentry/Hello-World.git',
    clone_url: 'https://github.com/getsentry/Hello-World.git',
    svn_url: 'https://github.com/getsentry/Hello-World',
    homepage: null,
    size: 0,
    stargazers_count: 0,
    watchers_count: 0,
    language: null,
    has_issues: true,
    has_projects: true,
    has_downloads: true,
    has_wiki: true,
    has_pages: true,
    forks_count: 0,
    mirror_url: null,
    archived: false,
    disabled: false,
    open_issues_count: 1,
    license: null,
    forks: 0,
    open_issues: 1,
    watchers: 0,
    default_branch: 'master',
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
  organization: {
    id: 1234,
    login: 'getsentry',
  },
};
