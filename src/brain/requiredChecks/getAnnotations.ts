import { getClient } from '@/api/github/getClient';
import { GETSENTRY_REPO, OWNER } from '@/config';
import { Annotation } from '@/types';

import { extractRunId } from './extractRunId';

// Filter any annotations that match these patterns
const FILTER_SINGLE: RegExp[] = [];

const FILTER_ALL_PRESENT: Array<RegExp[]> = [
  // Only ignore this pattern if they are together (e.g. we do not want to
  // ignore if operation was canceled due to something else)
  [/^The operation was canceled/i, /^The job was canceled because .* failed/i],
];

const PROCESS_CODE_PATTERN = /Process completed with exit code/;

// Filter all annotations that match, but only when ALL patterns are present
function filterAllPresent(annotations: Annotation[]) {
  const annotationMessages = annotations.map(({ message }) => message || '');

  // Are there any sets of patterns that all match?
  const allMatches = FILTER_ALL_PRESENT.filter((patterns) =>
    patterns.every((pattern) =>
      annotationMessages.find((message) => pattern.test(message))
    )
  ).flatMap((i) => i);

  // Now we can simply filter any annotations that match any pattern in `allMatches`
  return annotations.filter(
    (annotation) =>
      !allMatches.find((pattern) => pattern.test(annotation.message || ''))
  );
}

// Filters out annotations that match any patterns
function filterSingle(annotation: Annotation) {
  return !FILTER_SINGLE.find((pattern) =>
    pattern.test(annotation.message || '')
  );
}

function filterAnnotations(annotations: Annotation[]) {
  // Filter out annotations that have ALL of these patterns
  const filteredAnnotations =
    filterAllPresent(annotations).filter(filterSingle);

  // Now we can filter out any "Process completed with exit code <...>."
  // messages *ONLY* if we have other annotations.  Otherwise they are quite
  // useless messages. We should ideally *always* have an annotation as they
  // generally give better context of what went wrong, but that currently isn't
  // always the case.
  return filteredAnnotations.length > 1
    ? filteredAnnotations.filter(
        (annotation) => !PROCESS_CODE_PATTERN.test(annotation.message || '')
      )
    : filteredAnnotations;
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

        return [jobLink, filterAnnotations(annotations)];
      })
  );

  return Object.fromEntries(annotations);
}
