import { IncomingMessage, Server, ServerResponse } from 'http';

import { EventAlertType } from '@datadog/datadog-api-client/dist/packages/datadog-api-client-v1';
import { Block, KnownBlock } from '@slack/types';
import { FastifyInstance } from 'fastify';

// e.g. the return type of `buildServer`
export type Fastify = FastifyInstance<Server, IncomingMessage, ServerResponse>;

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

export type GenericEvent = {
  source: string;
  timestamp: number;
  service_name?: string; // Official service registry name if applicable
  data: {
    title: string;
    message: string;
    channels: {
      slack?: string[]; // list of Slack Channels
      datadog?: string[]; // list of DD Monitors
      jira?: string[]; // list of Jira Projects
      bigquery?: string;
    };
    tags?: string[]; // Not used for Slack
    misc: {
      alertType?: EventAlertType; // Datadog alert type
      blocks?: (KnownBlock | Block)[]; // Optional Slack blocks
    };
  };
};
