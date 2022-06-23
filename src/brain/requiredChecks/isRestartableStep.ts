import { Step } from '@/types';

/**
 * Steps in a workflow job that, when failed, can assume is intermittent and
 * should be restarted
 */
export function isRestartableStep(step: Step) {
  const RESTARTABLE_JOB_STEPS = [
    'set up job',
    'setup getsentry',
    'setup sentry',
  ];

  const stepName = step.name.toLowerCase();

  // This action seems to stall often, see https://github.com/actions/cache/issues/810
  if (stepName.startsWith('runs actions/cache@')) {
    return true;
  }

  if (RESTARTABLE_JOB_STEPS.includes(stepName)) {
    return true;
  }

  return false;
}
