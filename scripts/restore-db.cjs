#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Restores a .sql dump written by scripts/backup-db.cjs (Tier 4, item 22).
 *
 * Usage:
 *   npm run restore -- backups/jamil_creations-20260915-220000.sql
 *   npm run restore -- backups/xxx.sql --dry-run
 *   npm run restore -- backups/xxx.sql --yes           # skip the confirmation
 *
 * Restoring OVERWRITES the tables contained in the dump, so the script asks
 * for confirmation first (unless --yes). Take a fresh backup before restoring.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const positional = args.filter((arg) => !arg.startsWith("--"));
const dryRun = flags.includes("--dry-run");
const assumeYes = flags.includes("--yes");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (positional.length === 0) {
  fail(
    "Pass the dump file to restore, e.g. npm run restore -- backups/<file>.sql"
  );
}

const dumpFile = path.resolve(root, positional[0]);
if (!fs.existsSync(dumpFile)) fail(`Dump file not found: ${dumpFile}`);

const host = process.env.DATABASE_HOST || "localhost";
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD || "";
const database = process.env.DATABASE_NAME;
const port = process.env.DATABASE_PORT || "3306";

if (!user || !database) {
  fail("DATABASE_USER and DATABASE_NAME must be set in .env.");
}

// Same PATH fallback as the backup script — mysql.exe is also usually not on
// PATH on Windows.
const defaultWindowsClient =
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe";
const mysqlClient =
  process.env.MYSQL_PATH ||
  (process.platform === "win32" && fs.existsSync(defaultWindowsClient)
    ? defaultWindowsClient
    : "mysql");

console.log("Jamil Creations — database restore");
console.log(`  dump file: ${dumpFile}`);
console.log(`  database : ${database}@${host}:${port}`);
console.log(`  client   : ${mysqlClient}`);

if (dryRun) {
  console.log("  -- dry run — nothing restored --");
  process.exit(0);
}

function runRestore() {
  const restoreArgs = [
    "--host=" + host,
    "--port=" + port,
    "--user=" + user,
    "--default-character-set=utf8mb4",
    database,
  ];
  if (password) restoreArgs.unshift("--password=" + password);

  // The dump is piped in on stdin, so large files are not limited by argv.
  const input = fs.readFileSync(dumpFile);
  try {
    execFileSync(mysqlClient, restoreArgs, { input });
  } catch (error) {
    fail(`mysql failed (${error.code ?? "unknown error"}). See the output above.`);
  }
  console.log(`✔ restored ${path.basename(dumpFile)} into ${database}`);
}

if (assumeYes) {
  runRestore();
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(
  `This will overwrite tables in "${database}". Type "yes" to continue: `,
  (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Cancelled — nothing restored.");
      process.exit(0);
    }
    runRestore();
  }
);