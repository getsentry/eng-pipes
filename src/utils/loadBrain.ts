import { apis } from '@/brain/github/apis';
import { ghaCancel } from '@/brain/github/ghaCancel';
import { githubMetrics } from '@/brain/github/githubMetrics';
import { issueLabelHandler } from '@/brain/github/issueLabelHandler';
import { issueNotifier } from '@/brain/github/issueNotifier';
import { pleaseDeployNotifier } from '@/brain/github/pleaseDeployNotifier';
import { projectsHandler } from '@/brain/github/projectsHandler';
import { requiredChecks } from '@/brain/github/requiredChecks';
import { gocdConsecutiveUnsuccessfulAlert } from '@/brain/gocd/gocdConsecutiveUnsuccessfulAlert';
import { gocdDataDog } from '@/brain/gocd/gocdDataDog';
import { gocdNoDeploysAlert } from '@/brain/gocd/gocdNoDeploysAlert';
import { gocdSlackFeeds } from '@/brain/gocd/gocdSlackFeeds';
import { notifyOnGoCDStageEvent } from '@/brain/gocd/notifyOnGoCDStageEvent';
import { saveGoCDStageEvents } from '@/brain/gocd/saveGoCDStageEvents';
import { appHome } from '@/brain/slack/appHome';
import { notificationPreferences } from '@/brain/slack/notificationPreferences';
import { syncSlackUsers } from '@/brain/slack/syncSlackUsers';
import { syncUserProfileChange } from '@/brain/slack/syncUserProfileChange';
import { triggerPubSub } from '@/brain/slack/triggerPubSub';
import { typescript } from '@/brain/slack/typescript';

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
