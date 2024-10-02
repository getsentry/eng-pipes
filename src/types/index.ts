import { IncomingMessage, Server, ServerResponse } from 'http';

import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';
import { EmitterWebhookEvent } from '@octokit/webhooks';
import { FastifyInstance } from 'fastify';

// e.g. the return type of `buildServer`
export type Fastify = FastifyInstance<Server, IncomingMessage, ServerResponse>;

/**
 * GitHub types
 */
const octokit = new Octokit();

export type Issue = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.issues.get
>;

export type CompareCommits = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.compareCommits
>;

export type ReposGetCommit = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.getCommit
>;

export type Annotation = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.checks.listAnnotations
>[number];

export interface AppAuthStrategyOptions {
  appId: number;
  privateKey: string;
  installationId: number;
}

export interface GitHubIssuesSomeoneElseCaresAbout {
  nodeId: string;
  fieldIds: {
    productArea: string;
    status: string;
    responseDue: string;
  };
}

export interface GitHubOrgConfig {
  slug: any;
  appAuth: any;
  project: any;
  repos: any;
}

export interface GitHubOrgRepos {
  all: string[];
  withRouting: string[];
  withoutRouting: string[];
}

export type CheckRun = EmitterWebhookEvent<'check_run'>['payload']['check_run'];

// Note we intentionally only pick the pieces of checkRun that is needed to
// construct a message in "requiredChecks", as we want to minimize the
// properties to save to database
//
// Need to do this as we can't convert a string literal union to an array of literals
export const CHECK_RUN_PROPERTIES = ['id', 'head_sha', 'html_url'] as const;
export type CheckRunProperty = typeof CHECK_RUN_PROPERTIES[number];
export type CheckRunForRequiredChecksText = Pick<CheckRun, CheckRunProperty>;

export interface SentryOptionsResponse {
  region: string;
  source: string;
  drifted_options: { option_name: string; option_value: string }[];
  updated_options: { option_name: string; db_value: string; value: string }[];
  set_options: { option_name: string; option_value: string }[];
  unset_options: string[];
  not_writable_options: { option_name: string; error_msg: string }[];
  unregistered_options: string[];
  invalid_type_options: {
    option_name: string;
    got_type: string;
    expected_type: string;
  }[];
}

export interface KafkaControlPlaneResponse {
  source: string;
  title: string;
  body: string;
}
