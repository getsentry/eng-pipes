import { Octokit } from '@octokit/rest';
import fs from 'fs';
import tar from 'tar';
import path from 'path';

const owner = 'getsentry';
const repo = 'sentry';

const getTestFiles = function (
  dirPath: string,
  arrayOfFiles: string[] | undefined = []
) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      arrayOfFiles = getTestFiles(dirPath + '/' + file, arrayOfFiles);
    } else {
      if (/\.spec.*?$/.test(file)) {
        arrayOfFiles.push(path.join(dirPath, '/', file));
      }
    }
  });

  return arrayOfFiles;
};

export default async function getProgress() {
  const octokit = new Octokit();

  const content = await octokit.repos.getContent({
    owner,
    repo,
    path: 'tests/js',
  });

  if (!Array.isArray(content.data)) {
    throw new Error('Invalid directory');
  }

  const spec = content.data.find(({ name }) => name === 'spec');

  if (!spec) {
    throw new Error('Invalid directory');
  }

  const testsPath = `getsentry-sentry-${spec.sha.slice(0, 7)}`;

  // Delete existing files
  if (fs.existsSync(testsPath)) {
    fs.rmSync(testsPath, { recursive: true });
  }

  if (fs.existsSync('spec.tar.gz')) {
    fs.rmSync('spec.tar.gz', { recursive: true });
  }

  // Download the archive
  const response = await octokit.rest.repos.downloadTarballArchive({
    owner,
    repo,
    ref: spec.sha,
  });

  // @ts-ignore https://github.com/octokit/types.ts/issues/211
  const archiveData = Buffer.from(response.data);

  // Write archive to disk
  await fs.promises.writeFile('spec.tar.gz', archiveData);

  // Extract archive
  await tar.extract({ file: 'spec.tar.gz' });

  const testFiles = getTestFiles(testsPath);
  const testFilesWithEnzymeImport = testFiles.filter((file) => {
    const base64Content = fs.readFileSync(file);
    const content = Buffer.from(base64Content).toString('utf-8');
    return content.includes('sentry-test/enzyme');
  });

  return {
    remainingFiles: testFilesWithEnzymeImport.length,
    progress:
      Math.round(
        (testFilesWithEnzymeImport.length / testFiles.length) * 10000
      ) / 100,
  };
}
