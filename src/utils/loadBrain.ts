import { promises as fs } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';

import { apis } from '@/brain/apis';
import { appHome } from '@/brain/appHome';
import { ghaCancel } from '@/brain/ghaCancel';
import { githubMetrics } from '@/brain/githubMetrics';
import { gocdConsecutiveUnsuccessfulAlert } from '@/brain/gocdConsecutiveUnsuccessfulAlert';
import { gocdDataDog } from '@/brain/gocdDataDog';
import { gocdNoDeploysAlert } from '@/brain/gocdNoDeploysAlert';
import { gocdSlackFeeds } from '@/brain/gocdSlackFeeds';
import { issueLabelHandler } from '@/brain/issueLabelHandler';
import { issueNotifier } from '@/brain/issueNotifier';
import { notificationPreferences } from '@/brain/notificationPreferences';
import { notifyOnGoCDStageEvent } from '@/brain/notifyOnGoCDStageEvent';
import { pleaseDeployNotifier } from '@/brain/pleaseDeployNotifier';
import { projectsHandler } from '@/brain/projectsHandler';
import { requiredChecks } from '@/brain/requiredChecks';
import { saveGoCDStageEvents } from '@/brain/saveGoCDStageEvents';
import { syncSlackUsers } from '@/brain/syncSlackUsers';
import { syncUserProfileChange } from '@/brain/syncUserProfileChange';
import { triggerPubSub } from '@/brain/triggerPubSub';
import { typescript } from '@/brain/typescript';

const ROOT = path.join(__dirname, '../brain');

/**
 * This is only exported for test
 */
export async function getBrainModules(dir: string = ROOT): Promise<string[]> {
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
export function getExportedFunctions(fileNames: string[]): Function[] {
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

/**
 * Loads all functions in `@/brain`
 *
 * Currently we only want to load the exported fn whose name matches the module name,
 * this is because we sometimes export functions only for testing.
 */
export async function loadBrain(): Promise<string[]> {
  const loadFunctions = [
    apis,
    appHome,
    ghaCancel,
    githubMetrics,
    gocdConsecutiveUnsuccessfulAlert,
    gocdDataDog,
    gocdNoDeploysAlert,
    gocdSlackFeeds,
    issueLabelHandler,
    issueNotifier,
    notificationPreferences,
    notifyOnGoCDStageEvent,
    pleaseDeployNotifier,
    projectsHandler,
    requiredChecks,
    saveGoCDStageEvents,
    syncSlackUsers,
    syncUserProfileChange,
    triggerPubSub,
    typescript,
  ];
  loadFunctions.forEach((f) => f());

  // For test purposes, return the names of the functions loaded
  return loadFunctions.map((f) => f.name);
}
