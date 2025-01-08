export interface Team {
  id: string;
  display_name: string;
  tags: string[];
}

export interface Expert {
  email: string;
  name: string;
}

export interface Service {
  id: string;
  name: string;
  tier: number | null;
  component: string | null;
  teams: Team[];
  slack_channels: string[];
  alert_slack_channels: string[];
  domain_experts: Expert[];
  escalation: string;
  slos: string[];
  dashboard: string | null;
  production_readiness_docs: string[];
  notes: string | null;
  docs: Record<string, string>;
  aspiring_domain_experts: Expert[];
}

export type ServiceRegistry = {
  [serviceName: string]: Service;
};
