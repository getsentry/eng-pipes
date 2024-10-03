import { promises as fs } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';

const ROOT = path.join(__dirname, '../brain');

/**
 * Loads all modules in the root of `@/brain`
 *
 * Currently we only want to load the exported fn whose name matches the module name,
 * this is because we sometimes export functions only for testing.
 */
export async function loadBrain() {
  const modules = getExportedFunctions(await getBrainModules());
  modules.forEach((m) => m());
}

/**
 * This is only exported for test
 */
export async function getBrainModules() {
  return (await fs.readdir(ROOT)).filter(
    (f) => !f.endsWith('.d.ts') && !f.endsWith('.map') && !f.endsWith('.md')
  );
}

/**
 * This is only exported for test
 */
export function getExportedFunctions(fileNames: string[]) {
  return fileNames.flatMap((f) => {
    try {
      // Only return imported functions that match filename
      // This is because we sometimes need to export other functions to test
      const t = path.join(ROOT, f);
      const fileName = f.split('/').pop();
      return (
        Object.entries(require(t))
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
