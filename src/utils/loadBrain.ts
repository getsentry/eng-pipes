import { promises as fs } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';

const ROOT = path.join(__dirname, '../brain');

/**
 * Loads all modules in the root of `@/brain`
 *
 * Currently we only want to load the exported fn whose name matches the module name,
 * this is because we sometimes export functions only for testing.
 *
 * This function supports nested directories in `@/brain` via recursion
 */
export async function loadBrain() {
  const modules = getExportedFunctions(await getBrainModules());
  modules.forEach((m) => m());
}

/**
 * This is only exported for test
 * This function returns a list of relative paths to directories in brain which
 * contain a file that is not a .d.ts, .map, or .md file
 */
export async function getBrainModules(dir: string = ROOT) {
  // Read the directory contents
  const files = await fs.readdir(dir, { withFileTypes: true });
  const directories: Set<string> = new Set();

  // Loop through each file or directory in the current directory
  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      const nestedDirs = await getBrainModules(filePath);
      nestedDirs.forEach((nestedDir) => directories.add(nestedDir));
    } else if (
      !file.name.endsWith('.d.ts') &&
      !file.name.endsWith('.map') &&
      !file.name.endsWith('.md')
    ) {
      directories.add(path.relative(ROOT, dir)); // Add relative path to directory
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
export function getExportedFunctions(fileNames: string[]) {
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
