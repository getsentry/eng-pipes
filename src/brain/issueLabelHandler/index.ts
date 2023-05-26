import { githubEvents } from '@api/github';

import {
  ensureOneWaitingForLabel,
  updateCommunityFollowups,
} from './followups';
import { markRouted, markUnrouted } from './route';
import { markTriaged, markUntriaged } from './triage';
import { syncLabelsWithProjectField } from './project'

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
  githubEvents.removeListener(
    'issue_comment.created',
    updateCommunityFollowups
  );
  githubEvents.on('issue_comment.created', updateCommunityFollowups);
  githubEvents.removeListener('issues.labeled', ensureOneWaitingForLabel);
  githubEvents.on('issues.labeled', ensureOneWaitingForLabel);
  githubEvents.removeListener('projects_v2_item.edited', syncLabelsWithProjectField);
  githubEvents.on('projects_v2_item.edited', syncLabelsWithProjectField);
}
