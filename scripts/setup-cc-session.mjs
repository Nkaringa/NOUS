// One-shot setup for NOUS CC-session ingest.
// - Generates NOUS_INGEST_TOKEN
// - Fetches NOUS_INGEST_USER_ID from Supabase auth.users (single-user assumption)
// - Appends both to .env if not already present
// Run from project root.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ENV_PATH = ".env";
if (!existsSync(ENV_PATH)) {
  console.error("ERROR: .env not found in CWD");
  process.exit(1);
}

const envText = readFileSync(ENV_PATH, "utf8");

function getVar(name) {
  const m = envText.match(new RegExp(`^${name}=(.+)$`, "m"));
  return m?.[1]?.trim();
}

const SUPABASE_URL = getVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = getVar("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: Supabase URL or service key missing from .env");
  process.exit(1);
}

// 1. Fetch users via the auth admin endpoint
const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  },
});

if (!usersRes.ok) {
  console.error(`ERROR: auth/admin/users failed: ${usersRes.status}`);
  console.error(await usersRes.text());
  process.exit(1);
}

const { users } = await usersRes.json();
if (!users || users.length === 0) {
  console.error("ERROR: no users found in Supabase project");
  process.exit(1);
}

if (users.length > 1) {
  console.warn(
    `WARN: multiple users found (${users.length}); picking the oldest by created_at`,
  );
}

const oldest = users
  .slice()
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
const userId = oldest.id;
const email = oldest.email;

// 2. Generate token (or reuse existing)
const existingToken = getVar("NOUS_INGEST_TOKEN");
const existingUserId = getVar("NOUS_INGEST_USER_ID");

const token = existingToken || randomBytes(32).toString("hex");
const finalUserId = existingUserId || userId;

// 3. Append to .env (idempotent — only adds missing lines)
const lines = [];
if (!existingToken) lines.push(`NOUS_INGEST_TOKEN=${token}`);
if (!existingUserId) lines.push(`NOUS_INGEST_USER_ID=${finalUserId}`);

if (lines.length === 0) {
  console.log("Already configured. No changes to .env.");
} else {
  const newline = envText.endsWith("\n") ? "" : "\n";
  writeFileSync(ENV_PATH, envText + newline + lines.join("\n") + "\n");
  console.log(`Appended ${lines.length} line(s) to .env`);
}

console.log("");
console.log(`User identified: ${email}`);
console.log(`USER_ID:         ${finalUserId}`);
console.log(`TOKEN (first 8): ${token.slice(0, 8)}...   (length: ${token.length})`);
console.log("");
console.log("Restart the dev server (Ctrl+C, npm run dev) for the new env vars to load.");
