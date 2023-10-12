import { syncLabelsWithProjectField } from './project';

import { githubEvents } from '~/src/api/github';

export async function projectsHandler() {
  githubEvents.removeListener(
    'projects_v2_item.edited',
    syncLabelsWithProjectField
  );
  githubEvents.on('projects_v2_item.edited', syncLabelsWithProjectField);
}
