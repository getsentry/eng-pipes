import { BuildStatus } from '@/config';

export const OK_CONCLUSIONS = [
  BuildStatus.SUCCESS,
  BuildStatus.NEUTRAL,
  BuildStatus.SKIPPED,
] as string[];
