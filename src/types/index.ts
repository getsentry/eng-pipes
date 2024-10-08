import { IncomingMessage, Server, ServerResponse } from 'http';

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
