import { promises as fs } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';

import { loadBrain } from './loadBrain';

jest.unmock('./loadBrain');
const ROOT = path.join(__dirname, '../brain');

/**
 * This is only exported for test
 */
async function getBrainModules(dir: string = ROOT): Promise<string[]> {
  // Read the directory contents
  const files = await fs.readdir(dir, { withFileTypes: true });
  const directories: Set<string> = new Set();

  // Loop through each file or directory in the current directory
  for (const file of files) {
    if (file.isDirectory()) {
      const nestedDirs = await getBrainModules(path.join(dir, file.name));
      nestedDirs.forEach((nestedDir) => directories.add(nestedDir));
    } else if (
      !file.name.endsWith('.d.ts') &&
      !file.name.endsWith('.map') &&
      !file.name.endsWith('.md')
    ) {
      directories.add(path.relative(ROOT, dir));
    }
  }
  return Array.from(directories);
}

/**
 * This is only exported for test
 * This function takes a list of relative paths to directories in brain
 * and returns a list of exported functions from those directories
 * which have the same name as the directory
 */
function getExportedFunctions(fileNames: string[]): Function[] {
  return fileNames.flatMap((f) => {
    try {
      // Only return imported functions that match filename
      // This is because we sometimes need to export other functions to test
      const fileName = f.split('/').pop();
      return (
        Object.entries(require(path.join(ROOT, f)))
          // @ts-ignore
          .filter(([key]) => key === fileName)
          .map(([, value]) => value)
      );
    } catch (e) {
      const err = new Error(`Unable to load brain: ${f}`);
      Sentry.captureException(err);
      console.error(err);
      return [];
    }
  }) as Function[];
}

describe('loadBrain', function () {
  it('makes sure that every exported function in `brain/` is actually loaded', async function () {
    const modules = await getBrainModules();
    const fns = getExportedFunctions(modules);

    const loadedFns = await loadBrain();
    expect(new Set(loadedFns)).toEqual(new Set(fns.map((f) => f.name)));
  });
  it('makes sure that every loaded function is one of these ones', async function () {
    const expected = [
      'apis',
      'appHome',
      'ghaCancel',
      'githubMetrics',
      'gocdConsecutiveUnsuccessfulAlert',
      'gocdDataDog',
      'gocdNoDeploysAlert',
      'gocdSlackFeeds',
      'issueLabelHandler',
      'issueNotifier',
      'notificationPreferences',
      'notifyOnGoCDStageEvent',
      'pleaseDeployNotifier',
      'projectsHandler',
      'requiredChecks',
      'saveGoCDStageEvents',
      'syncSlackUsers',
      'syncUserProfileChange',
      'triggerPubSub',
      'typescript',
    ];
    const loadedFns = await loadBrain();
    expect(new Set(loadedFns)).toEqual(new Set(expected));
  });
});
