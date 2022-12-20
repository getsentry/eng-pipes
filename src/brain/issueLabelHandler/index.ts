import { githubEvents } from '@api/github';

import { markRouted, markUnrouted } from './route';
import { markTriaged, markUntriaged } from './triage';

// Install.

export async function issueLabelHandler() {
  githubEvents.removeListener('issues.opened', markUntriaged);
  githubEvents.on('issues.opened', markUntriaged);
  githubEvents.removeListener('issues.labeled', markTriaged);
  githubEvents.on('issues.labeled', markTriaged);
  githubEvents.removeListener('issues.opened', markUnrouted);
  githubEvents.on('issues.opened', markUnrouted);
  githubEvents.removeListener('issues.labeled', markRouted);
  githubEvents.on('issues.labeled', markRouted);
}
