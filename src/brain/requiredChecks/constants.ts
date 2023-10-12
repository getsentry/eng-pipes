import { BuildStatus } from '~/config';

export const OK_CONCLUSIONS = [
  BuildStatus.SUCCESS,
  BuildStatus.NEUTRAL,
  BuildStatus.SKIPPED,
] as string[];

/**
 * Steps in a workflow job that, when failed, can assume is intermittent and
 * should be restarted
 */
export const RESTARTABLE_JOB_STEPS = [
  'Set up job',
  'Setup Getsentry',
  'Setup Sentry',
];
