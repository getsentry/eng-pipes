import { GETSENTRY_ORG, SENTRY_REPO_SLUG } from '@/config';

/**
 * Paths that we do not intend to convert to ts
 */
const IGNORED_PATHS = [/views\/events.*/, /views\/dashboards.*/];

export default async function getProgress({
  repo = SENTRY_REPO_SLUG,
  basePath = 'static',
  appDir = 'app',
  date,
}: {
  repo?: string;
  basePath?: string;
  appDir?: string;
  date?: string;
}) {
  const getContentsParams: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  } = {
    owner: GETSENTRY_ORG.slug,
    repo,
    path: basePath,
  };

  if (date) {
    const commits = await GETSENTRY_ORG.api.repos.listCommits({
      owner: GETSENTRY_ORG.slug,
      repo,
      until: date,
      per_page: 1,
    });

    if (commits.data.length) {
      getContentsParams.ref = commits.data[0].sha;
    }
  }

  const contents = await GETSENTRY_ORG.api.repos.getContent(getContentsParams);

  if (!Array.isArray(contents.data)) {
    throw new Error('Invalid directory');
  }

  const app = contents.data.find(({ name }) => name === appDir);

  if (!app) {
    throw new Error('Invalid directory');
  }

  const tree = await GETSENTRY_ORG.api.git.getTree({
    owner: GETSENTRY_ORG.slug,
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
