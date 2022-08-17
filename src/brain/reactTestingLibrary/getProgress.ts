import { PassThrough as PassThroughStream } from 'stream';

import { Octokit } from '@octokit/rest';
import { Parse as TarParser, ReadEntry } from 'tar';

const owner = 'getsentry';
const repo = 'sentry';

export async function getProgress() {
  const octokit = new Octokit();

  const testContent = await octokit.repos.getContent({
    owner,
    repo,
    path: 'tests/js',
  });

  if (!Array.isArray(testContent.data)) {
    throw new Error('Invalid directory');
  }

  const spec = testContent.data.find(({ name }) => name === 'spec');

  if (!spec) {
    throw new Error('Invalid directory');
  }

  // Download the archive
  const response = await octokit.rest.repos.downloadTarballArchive({
    owner,
    repo,
    ref: spec.sha,
  });

  // @ts-expect-error https://github.com/octokit/types.ts/issues/211
  const archiveData = Buffer.from(response.data);

  const testFiles: string[] = [];
  const testFilesWithEnzymeImport: string[] = [];

  await new Promise<void>((resolve) => {
    const stream = new PassThroughStream();
    stream.end(archiveData);
    const parser = new TarParser({
      strict: true,
      filter: (currentPath: string) => {
        return /\.spec.*?$/.test(currentPath);
      },
      onentry: (entry: ReadEntry) => {
        testFiles.push(entry.path);
        entry
          .on('data', (data) => {
            const content = Buffer.from(data).toString('utf-8');
            if (content.includes('sentry-test/enzyme')) {
              testFilesWithEnzymeImport.push(entry.path);
            }
          })
          .resume();
      },
    });

    stream.pipe(parser).on('end', resolve);
  });

  return {
    remainingFiles: testFilesWithEnzymeImport.length,
    progress:
      Math.round(
        (1 - testFilesWithEnzymeImport.length / testFiles.length) * 10000
      ) / 100,
  };
}
