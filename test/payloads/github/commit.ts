const payload = {
  sha: '6d225cb77225ac655d817a7551a26fff85090fe6',
  node_id:
    'MDY6Q29tbWl0MzA2MDkyNTo2ZDIyNWNiNzcyMjVhYzY1NWQ4MTdhNzU1MWEyNmZmZjg1MDkwZmU2',
  commit: {
    author: {
      name: 'Matej Minar',
      email: 'matej.minar@sentry.io',
      date: '2021-02-03T11:06:51Z',
    },
    committer: {
      name: 'Sentry Bot',
      email: 'bot@getsentry.com',
      date: '2021-02-03T11:06:51Z',
    },
    message:
      'getsentry/sentry@88c22a29176df64cfc027637a5ccfd9da1544e9f\n\n#skipsentry',
    tree: {
      sha: '1b958b1e3c38113f0e9c5e33e45fb911fce41338',
      url:
        'https://api.github.com/repos/getsentry/getsentry/git/trees/1b958b1e3c38113f0e9c5e33e45fb911fce41338',
    },
    url:
      'https://api.github.com/repos/getsentry/getsentry/git/commits/6d225cb77225ac655d817a7551a26fff85090fe6',
    comment_count: 0,
    verification: {
      verified: false,
      reason: 'unsigned',
      signature: null,
      payload: null,
    },
  },
  url:
    'https://api.github.com/repos/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6',
  html_url:
    'https://github.com/getsentry/getsentry/commit/6d225cb77225ac655d817a7551a26fff85090fe6',
  comments_url:
    'https://api.github.com/repos/getsentry/getsentry/commits/6d225cb77225ac655d817a7551a26fff85090fe6/comments',
  author: {
    login: 'matejminar',
    id: 9060071,
    node_id: 'MDQ6VXNlcjkwNjAwNzE=',
    avatar_url: 'https://avatars.githubusercontent.com/u/9060071?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/matejminar',
    html_url: 'https://github.com/matejminar',
    followers_url: 'https://api.github.com/users/matejminar/followers',
    following_url:
      'https://api.github.com/users/matejminar/following{/other_user}',
    gists_url: 'https://api.github.com/users/matejminar/gists{/gist_id}',
    starred_url:
      'https://api.github.com/users/matejminar/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/matejminar/subscriptions',
    organizations_url: 'https://api.github.com/users/matejminar/orgs',
    repos_url: 'https://api.github.com/users/matejminar/repos',
    events_url: 'https://api.github.com/users/matejminar/events{/privacy}',
    received_events_url:
      'https://api.github.com/users/matejminar/received_events',
    type: 'User',
    site_admin: false,
  },
  committer: {
    login: 'getsentry-bot',
    id: 10587625,
    node_id: 'MDQ6VXNlcjEwNTg3NjI1',
    avatar_url: 'https://avatars.githubusercontent.com/u/10587625?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/getsentry-bot',
    html_url: 'https://github.com/getsentry-bot',
    followers_url: 'https://api.github.com/users/getsentry-bot/followers',
    following_url:
      'https://api.github.com/users/getsentry-bot/following{/other_user}',
    gists_url: 'https://api.github.com/users/getsentry-bot/gists{/gist_id}',
    starred_url:
      'https://api.github.com/users/getsentry-bot/starred{/owner}{/repo}',
    subscriptions_url:
      'https://api.github.com/users/getsentry-bot/subscriptions',
    organizations_url: 'https://api.github.com/users/getsentry-bot/orgs',
    repos_url: 'https://api.github.com/users/getsentry-bot/repos',
    events_url: 'https://api.github.com/users/getsentry-bot/events{/privacy}',
    received_events_url:
      'https://api.github.com/users/getsentry-bot/received_events',
    type: 'User',
    site_admin: false,
  },
  parents: [
    {
      sha: '1af4671a0b4ebba7814161f412354e8eab0eeb39',
      url:
        'https://api.github.com/repos/getsentry/getsentry/commits/1af4671a0b4ebba7814161f412354e8eab0eeb39',
      html_url:
        'https://github.com/getsentry/getsentry/commit/1af4671a0b4ebba7814161f412354e8eab0eeb39',
    },
  ],
  stats: { total: 4, additions: 2, deletions: 2 },
  files: [
    {
      sha: 'd4984d6fd10acedefe0551732679059a7f07b2e4',
      filename: 'Dockerfile',
      status: 'modified',
      additions: 1,
      deletions: 1,
      changes: 2,
      blob_url:
        'https://github.com/getsentry/getsentry/blob/6d225cb77225ac655d817a7551a26fff85090fe6/Dockerfile',
      raw_url:
        'https://github.com/getsentry/getsentry/raw/6d225cb77225ac655d817a7551a26fff85090fe6/Dockerfile',
      contents_url:
        'https://api.github.com/repos/getsentry/getsentry/contents/Dockerfile?ref=6d225cb77225ac655d817a7551a26fff85090fe6',
      patch:
        '@@ -152,7 +152,7 @@ RUN export YARN_CACHE_FOLDER="$(mktemp -d)" \\\n' +
        '     && rm -r "$YARN_CACHE_FOLDER"\n' +
        ' \n' +
        ' # Do not change this manually. If you are testing a non-master branch, use bin/bump-sentry.\n' +
        '-ENV SENTRY_VERSION_SHA 77eb4d0911b19c91d9663a5e08a5d7ae16fcfecd\n' +
        '+ENV SENTRY_VERSION_SHA 88c22a29176df64cfc027637a5ccfd9da1544e9f\n' +
        ' RUN export YARN_CACHE_FOLDER="$(mktemp -d)" \\\n' +
        '     && SENTRY_SKIP_BACKEND_VALIDATION=1 \\\n' +
        '         pip install -e git+https://github.com/getsentry/sentry.git@${SENTRY_VERSION_SHA}#egg=sentry \\',
    },
    {
      sha: '135a547f2c4ca6318fb403aa95fcb3882ef6909e',
      filename: 'requirements-sentry.txt',
      status: 'modified',
      additions: 1,
      deletions: 1,
      changes: 2,
      blob_url:
        'https://github.com/getsentry/getsentry/blob/6d225cb77225ac655d817a7551a26fff85090fe6/requirements-sentry.txt',
      raw_url:
        'https://github.com/getsentry/getsentry/raw/6d225cb77225ac655d817a7551a26fff85090fe6/requirements-sentry.txt',
      contents_url:
        'https://api.github.com/repos/getsentry/getsentry/contents/requirements-sentry.txt?ref=6d225cb77225ac655d817a7551a26fff85090fe6',
      patch:
        '@@ -1,2 +1,2 @@\n' +
        ' # Do not change this manually. If you are testing a non-master branch, use bin/bump-sentry.\n' +
        '--e git+https://github.com/getsentry/sentry.git@77eb4d0911b19c91d9663a5e08a5d7ae16fcfecd#egg=sentry-dev\n' +
        '+-e git+https://github.com/getsentry/sentry.git@88c22a29176df64cfc027637a5ccfd9da1544e9f#egg=sentry-dev',
    },
  ],
};

export default payload;
