import { FastifyRequest } from 'fastify';

// import { insert } from '../../../utils/db';

export async function handler(request: FastifyRequest) {
  const { payload } = request.body;

  console.log(JSON.stringify(payload, null, 4));

  const eventType = request.headers['X-GitHub-Event'];

  const data = {
    type: eventType,
    action: payload['action'],
    username: payload['sender']['login'],
    user_id: payload['sender']['id'],
    repository: payload['repository']['full_name'],
  };
  // if eventType == "issues":
  // data["object_id"] = payload["issue"]["number"]
  // data["created_at"] = payload["issue"]["created_at"]
  // data["updated_at"] = payload["issue"]["updated_at"]
  // elif eventType == "issue_comment":
  // data["object_id"] = payload["comment"]["id"]
  // data["created_at"] = payload["comment"]["created_at"]
  // data["updated_at"] = payload["comment"]["updated_at"]
  // data["target_id"] = payload["issue"]["number"]
  // data["target_type"] = "issue"
  // elif eventType == "pull_request":
  // data["object_id"] = payload["pull_request"]["number"]
  // data["created_at"] = payload["pull_request"]["created_at"]
  // data["updated_at"] = payload["pull_request"]["updated_at"]
  // if payload["action"] == "review_requested":
  // if "requested_reviewer" in payload:
  // data["target_id"] = payload["requested_reviewer"]["id"]
  // data["target_name"] = payload["requested_reviewer"]["login"]
  // data["target_type"] = "user"
  // elif "requested_team" in payload:
  // data["target_id"] = payload["requested_team"]["id"]
  // data["target_name"] = payload["requested_team"]["name"]
  // data["target_type"] = "team"
  // elif eventType == "pull_request_review":
  // data["object_id"] = payload["review"]["id"]
  // data["created_at"] = payload["review"]["submitted_at"]
  // data["updated_at"] = payload["pull_request"]["updated_at"]
  // data["target_id"] = payload["pull_request"]["number"]
  // data["target_name"] = payload["review"]["state"]
  // data["target_type"] = "pull_request"
  // else:
  // raise ValueError("Unknown payload type")

  return {};
}
