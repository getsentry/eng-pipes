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
