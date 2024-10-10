import { githubEvents } from '@api/github';

import {
  cleanLabelsOnClosedIssues,
  clearWaitingForProductOwnerStatus,
  ensureOneWaitingForLabel,
  updateFollowupsOnComment,
} from './followups';
import { handleNewIssues, markNotWaitingForSupport } from './route';
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
  githubEvents.removeListener('issues.opened', handleNewIssues);
  githubEvents.on('issues.opened', handleNewIssues);
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
  githubEvents.removeListener('issues.closed', cleanLabelsOnClosedIssues);
  githubEvents.on('issues.closed', cleanLabelsOnClosedIssues);
}
