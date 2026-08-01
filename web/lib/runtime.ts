import { env } from "cloudflare:workers";

export type QueueMetroEnv = {
  DB: D1Database;
  OWNER_BOOTSTRAP_CODE?: string;
  RATE_LIMIT_SALT?: string;
};

export function runtimeEnv(): QueueMetroEnv {
  return env as unknown as QueueMetroEnv;
}
