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

interface BaseSlackMessage {
  type: 'slack';
  text: string;
  blocks?: KnownBlock[] | Block[];
}

export interface SlackChannel extends BaseSlackMessage {
  channels: string[];
}

// Currently service registry is only used for Slack notifications since
// it only contains Slack alert channels (and not DD or Jira or others)
export interface ServiceSlackChannel extends BaseSlackMessage {
  service_name: string;
}
export type SlackMessage = SlackChannel | ServiceSlackChannel;

export interface DatadogEvent {
  type: 'datadog';
  title: string;
  text: string;
  tags: string[];
  alertType: EventAlertType;
}

export interface JiraEvent {
  type: 'jira';
  projectId: string;
  title: string;
}

export type GenericEvent = {
  source: string;
  timestamp: number;
  data: (DatadogEvent | JiraEvent | SlackMessage)[];
};
