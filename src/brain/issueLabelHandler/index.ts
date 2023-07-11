import { githubEvents } from '@api/github';

import {
  ensureOneWaitingForLabel,
  updateCommunityFollowups,
} from './followups';
import { markNotWaitingForSupport, markWaitingForSupport } from './route';
import {
  markNotWaitingForProductOwner,
  markWaitingForProductOwner,
} from './triage';

// Install.

export async function issueLabelHandler() {
  githubEvents.removeListener('issues.opened', markWaitingForProductOwner);
  githubEvents.on('issues.opened', markWaitingForProductOwner);
  githubEvents.removeListener('issues.labeled', markNotWaitingForProductOwner);
  githubEvents.on('issues.labeled', markNotWaitingForProductOwner);
  githubEvents.removeListener('issues.opened', markWaitingForSupport);
  githubEvents.on('issues.opened', markWaitingForSupport);
  githubEvents.removeListener('issues.labeled', markNotWaitingForSupport);
  githubEvents.on('issues.labeled', markNotWaitingForSupport);
  githubEvents.removeListener(
    'issue_comment.created',
    updateCommunityFollowups
  );
  githubEvents.on('issue_comment.created', updateCommunityFollowups);
  githubEvents.removeListener('issues.labeled', ensureOneWaitingForLabel);
  githubEvents.on('issues.labeled', ensureOneWaitingForLabel);
}
