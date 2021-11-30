import { getClient } from '@/api/github/getClient';
import { GETSENTRY_REPO, OWNER } from '@/config';
import { Annotation } from '@/types';

import { extractRunId } from './extractRunId';

const IGNORED_ANNOTATIONS: Array<RegExp | RegExp[]> = [
  // Only ignore this pattern if they are together (e.g. we do not want to
  // ignore if operation was canceled due to something else)
  [/^The operation was canceled/i, /^The job was canceled because .* failed/i],
];

function filterIgnoredAnnotations(annotations: Annotation[]) {
  return annotations.filter(
    (annotation) =>
      !IGNORED_ANNOTATIONS.find((ignorePattern) =>
        Array.isArray(ignorePattern)
          ? ignorePattern.find((pattern) =>
              pattern.test(annotation.message || '')
            )
          : ignorePattern.test(annotation.message || '')
      )
  );
}

/**
 * Given a list of [job link text, conclusion], return a map of <job link text, annotations>
 */
export async function getAnnotations(jobs: string[][]) {
  const octokit = await getClient(OWNER);

  const annotations = await Promise.all(
    jobs
      // We need to extract the run id from a string that comes from a GHA
      // Action (requiredChecks in `getsentry`)
      .map(([jobLink]) => [jobLink, extractRunId(jobLink)])
      .filter(([, runId]) => runId)
      .map(async ([jobLink, checkRunId]) => {
        const { data: annotations } = await octokit.checks.listAnnotations({
          owner: OWNER,
          repo: GETSENTRY_REPO,
          check_run_id: parseInt(checkRunId ?? '0', 10),
        });

        return [jobLink, filterIgnoredAnnotations(annotations)];
      })
  );

  return Object.fromEntries(annotations);
}
