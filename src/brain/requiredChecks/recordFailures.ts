import { Annotation, CheckRun } from '@/types';
import { db } from '@/utils/db';

interface RecordFailuresParams {
  checkRun: CheckRun;
  jobs: string[][];
  annotationsByJob: Record<string, Annotation[]>;
}

/**
 * Given a list of [job link text, conclusion], return a map of <job link text, annotations>
 */
export async function recordFailures({
  checkRun,
  jobs,
  annotationsByJob,
}: RecordFailuresParams) {
  const recordsToInsert = jobs.flatMap(([jobLink]) => {
    if (!annotationsByJob[jobLink]) {
      return [];
    }

    const jobLinkpattern = /\[([^\]]+)\]\(([^)]+)\)/;
    const matches = jobLink.match(jobLinkpattern);

    return annotationsByJob[jobLink]
      .filter(({ annotation_level }) => annotation_level === 'failure')
      .map((annotation) => ({
        sha: checkRun.head_sha,
        job_name: matches?.[1] ?? '',
        annotation: annotation.message,
        annotation_title: annotation.title,
        annotation_path: annotation.path,
        failed_at: checkRun.completed_at,
      }));
  });

  if (!recordsToInsert.length) {
    return;
  }

  return await db('build_failures').insert(recordsToInsert);
}
