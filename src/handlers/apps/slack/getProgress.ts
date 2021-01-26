import { getClient } from '../../../api/github/getClient';

/**
 * Paths that we do not intend to convert to ts
 */
const IGNORED_PATHS = [/views\/events.*/, /views\/dashboards.*/];

export default async function getProgress(date?: string) {
  const owner = 'getsentry';
  const repo = 'sentry';
  const octokit = await getClient('getsentry', 'sentry');

  const getContentsParams: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  } = {
    owner,
    repo,
    path: 'src/sentry/static/sentry',
  };

  if (date) {
    const commits = await octokit.repos.listCommits({
      owner,
      repo,
      until: date,
      per_page: 1,
    });

    if (commits.data.length) {
      getContentsParams.ref = commits.data[0].sha;
    }
  }

  const contents = await octokit.repos.getContent(getContentsParams);

  if (!Array.isArray(contents.data)) {
    throw new Error('Invalid directory');
  }

  const app = contents.data.find(({ name }) => name === 'app');

  if (!app) {
    throw new Error('Invalid directory');
  }

  const tree = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: app.sha,
    recursive: '1',
  });

  const jsxFiles: string[] = [];
  const tsxFiles: string[] = [];

  for (const obj of tree.data.tree) {
    const filePath = obj.path || '';

    if (/\.tsx?$/.test(filePath)) {
      tsxFiles.push(filePath);
    }
    if (
      /\.jsx?$/.test(filePath) &&
      !IGNORED_PATHS.some((r) => r.test(filePath))
    ) {
      jsxFiles.push(filePath);
    }
  }

  const total = jsxFiles.length + tsxFiles.length;

  return {
    remainingFiles: jsxFiles.length,
    total,
    progress: Math.round((tsxFiles.length / total) * 10000) / 100,
  };
}
