import { githubEvents } from '@api/github';

import { markTriaged, markUntriaged } from './triage';

export async function issueLabelHandler() {
  githubEvents.removeListener('issues.opened', markUntriaged);
  githubEvents.on('issues.opened', markUntriaged);
  githubEvents.removeListener('issues.labeled', markTriaged);
  githubEvents.on('issues.labeled', markTriaged);
}
