import {
  clearWaitingForProductOwnerStatus,
  ensureOneWaitingForLabel,
  updateFollowupsOnComment,
} from './followups';
import { markNotWaitingForSupport, markWaitingForSupport } from './route';
import {
  markNotWaitingForProductOwner,
  markWaitingForProductOwner,
} from './triage';

import { githubEvents } from '~/api/github';

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
    updateFollowupsOnComment
  );
  githubEvents.on('issue_comment.created', updateFollowupsOnComment);
  githubEvents.removeListener('issues.labeled', ensureOneWaitingForLabel);
  githubEvents.on('issues.labeled', ensureOneWaitingForLabel);
  githubEvents.removeListener(
    'issues.unlabeled',
    clearWaitingForProductOwnerStatus
  );
  githubEvents.on('issues.unlabeled', clearWaitingForProductOwnerStatus);
}
