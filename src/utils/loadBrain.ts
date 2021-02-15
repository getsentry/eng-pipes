import { promises as fs } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';

/**
 * Loads all modules in the root of `@/brain`
 */
export async function loadBrain() {
  const root = path.join(__dirname, '../brain');

  const modules: Function[] = (await fs.readdir(root))
    .filter((f) => !f.endsWith('.d.ts') && !f.endsWith('.map'))
    .flatMap((f) => {
      try {
        return Object.values(require(path.join(root, f)));
      } catch (e) {
        const err = new Error(`Unable to load brain: ${f}`);
        Sentry.captureException(err);
        console.error(err);
        return [];
      }
    });

  modules.forEach((m) => m());
}
