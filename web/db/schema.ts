import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const admins = sqliteTable("admins", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  publicKeySpki: text("public_key_spki").notNull(),
  role: text("role", { enum: ["owner", "admin"] }).notNull().default("admin"),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
}, (table) => [index("admins_active_idx").on(table.revokedAt)]);

export const webDevices = sqliteTable("web_devices", {
  id: text("id").primaryKey(),
  secretHash: text("secret_hash").notNull(),
  status: text("status", { enum: ["pending", "allowed", "blocked", "revoked"] })
    .notNull()
    .default("pending"),
  note: text("note").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  authorizedAt: integer("authorized_at"),
  authorizedBy: text("authorized_by"),
  blockedAt: integer("blocked_at"),
}, (table) => [
  index("web_devices_status_idx").on(table.status, table.lastSeenAt),
  index("web_devices_note_idx").on(table.note),
]);

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  status: text("status", { enum: ["pending", "allowed", "cancelled", "blocked", "expired"] })
    .notNull()
    .default("pending"),
  approvalTokenHash: text("approval_token_hash").notNull(),
  pollTokenHash: text("poll_token_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  decidedAt: integer("decided_at"),
  decidedBy: text("decided_by"),
  note: text("note").notNull().default(""),
}, (table) => [
  index("approval_requests_device_idx").on(table.deviceId, table.createdAt),
  index("approval_requests_status_idx").on(table.status, table.expiresAt),
  uniqueIndex("approval_requests_token_idx").on(table.approvalTokenHash),
]);

export const adminChallenges = sqliteTable("admin_challenges", {
  id: text("id").primaryKey(),
  adminId: text("admin_id"),
  nonce: text("nonce").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
}, (table) => [index("admin_challenges_expiry_idx").on(table.expiresAt)]);

export const webSessions = sqliteTable("web_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  deviceId: text("device_id").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("web_sessions_token_idx").on(table.tokenHash),
  index("web_sessions_device_idx").on(table.deviceId, table.expiresAt),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  adminId: text("admin_id"),
  deviceId: text("device_id"),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("audit_logs_created_idx").on(table.createdAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)]);
