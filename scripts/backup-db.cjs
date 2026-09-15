#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Automated MySQL backup (Tier 4, item 22).
 *
 * Runs `mysqldump` against the database named in .env and writes a timestamped
 * .sql file into backups/, then deletes backups older than BACKUP_KEEP_DAYS
 * (default 14) so the folder doesn't grow forever.
 *
 * Usage:
 *   npm run backup                                   # normal run
 *   npm run backup -- --dry-run                      # show the plan, do nothing
 *   npm run backup -- --keep-days=30                 # override retention
 *   npm run backup -- --name=pre-upgrade             # tag the file name
 *
 * Windows Task Scheduler example (daily 22:00):
 *   schtasks /create /tn "Jamil Creations DB backup" /sc daily /st 22:00 ^
 *     /tr "cmd /c cd /d D:\\Mihsan\\software\\jamilcreations-garments && npm run backup >> logs\\backup.log 2>&1"
 *
 * Linux/macOS cron example (daily 22:00):
 *   0 22 * * * cd /srv/jamilcreations-garments && npm run backup >> logs/backup.log 2>&1
 *
 * NOTE ON IMAGES: fabric photos and product images live in the Cloudinary
 * account, NOT in MySQL — this script never touches them. Keep the Cloudinary
 * credentials and the account itself safe: a database restore gives you back
 * the image_url values, but only Cloudinary can give back the actual files.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// ── Load .env ourselves (no dotenv dependency needed) ────────────────────
// Real environment variables win, so `DATABASE_PASSWORD=... npm run backup`
// still overrides the file.
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

// ── Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keepDaysArg = args.find((arg) => arg.startsWith("--keep-days="));
const nameArg = args.find((arg) => arg.startsWith("--name="));
const keepDays = keepDaysArg
  ? Number(keepDaysArg.split("=")[1])
  : Number(process.env.BACKUP_KEEP_DAYS || 14);
const label = nameArg ? nameArg.split("=")[1].replace(/[^\w.-]/g, "-") : "";

// ── Config from the environment ─────────────────────────────────────────
const host = process.env.DATABASE_HOST || "localhost";
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD || "";
const database = process.env.DATABASE_NAME;
const port = process.env.DATABASE_PORT || "3306";

// mysqldump is not always on PATH (it isn't on a default Windows install),
// so MYSQLDUMP_PATH — or the standard MySQL Server 8.0 location — is honoured.
const defaultWindowsDump =
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe";
const mysqldump =
  process.env.MYSQLDUMP_PATH ||
  (process.platform === "win32" && fs.existsSync(defaultWindowsDump)
    ? defaultWindowsDump
    : "mysqldump");

const backupDir = process.env.BACKUP_DIR || path.join(root, "backups");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!user || !database) {
  fail(
    "DATABASE_USER and DATABASE_NAME must be set in .env (see .env.example)."
  );
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

const fileName = `${database}-${timestamp()}${label ? `-${label}` : ""}.sql`;
const filePath = path.join(backupDir, fileName);

// ── Retention: delete dumps older than keepDays ────────────────────────
function pruneOldBackups() {
  if (!fs.existsSync(backupDir)) return;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of fs.readdirSync(backupDir)) {
    if (!/\.sql(\.gz)?$/i.test(entry)) continue;
    const full = path.join(backupDir, entry);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      if (dryRun) {
        console.log(`   would delete ${entry} (older than ${keepDays} days)`);
      } else {
        fs.rmSync(full);
        removed += 1;
      }
    }
  }
  if (removed > 0) console.log(`   pruned ${removed} old backup(s)`);
}

console.log("Jamil Creations — database backup");
console.log(`  database : ${database}@${host}:${port}`);
console.log(`  dump tool: ${mysqldump}`);
console.log(`  target   : ${filePath}`);
console.log(`  retention: ${keepDays} day(s)`);

if (dryRun) {
  console.log("  -- dry run — no file written --");
  pruneOldBackups();
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });

// Command-line args (no shell involved → safe with special characters).
// --single-transaction keeps InnoDB tables consistent without locking the shop
// out while the dump runs; --routines/--events/--triggers keep server-side
// logic that the schema may add later.
const dumpArgs = [
  "--host=" + host,
  "--port=" + port,
  "--user=" + user,
  "--single-transaction",
  "--routines",
  "--events",
  "--triggers",
  "--default-character-set=utf8mb4",
  "--set-gtid-purged=OFF",
  `--result-file=${filePath}`,
  database,
];

if (password) dumpArgs.unshift("--password=" + password);

try {
  execFileSync(mysqldump, dumpArgs, {
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch (error) {
  fail(
    `mysqldump failed (${error.code ?? "unknown error"}). ` +
      "Check DATABASE_* in .env and that the server is running."
  );
}

const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
if (size === 0) fail("mysqldump produced an empty file — backup discarded.");
console.log(`✔ wrote ${fileName} (${(size / 1024 / 1024).toFixed(2)} MB)`);

pruneOldBackups();
console.log("Done.");
