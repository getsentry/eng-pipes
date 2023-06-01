import { githubEvents } from '@api/github';

import { syncLabelsWithProjectField } from './project';

export async function projectsHandler() {
  githubEvents.removeListener(
    'projects_v2_item.edited',
    syncLabelsWithProjectField
  );
  githubEvents.on('projects_v2_item.edited', syncLabelsWithProjectField);
}
