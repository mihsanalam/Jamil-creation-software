# Jamil Creations Garments

An internal management system for a garments business, built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, MySQL (mysql2), and NextAuth.js v5.

## Features / Progress

| # | Feature | Status |
|---|---------|--------|
| 1 | Setup (Next.js, Tailwind, shadcn/ui, MySQL connection) | ✅ Done |
| 2 | Database schema (`docs/jamil-creations-schema.sql`) | ✅ Done |
| 3 | **Auth & Roles** — Login page, JWT sessions, three roles (**Owner / Collector / Operator**), route protection per role via middleware + per-page guards | ✅ **Done** |
| 4 | **App Sidebar** — shared `components/sidebar/sidebar.tsx` used by every role's pages; per-role nav lists, active-item highlighting, sign-out. Pages must use this component — never inline sidebar markup (see CLAUDE.md) | ✅ **Done** |
| 5 | **Fabric Intake (Collector)** — `/collector/fabric-intake`: record incoming fabric batches (fabric type, quantity + meters/kg unit, supplier, date received, description, process notes). No-scroll single-screen form in the brand look (charcoal / gold / cream) | ✅ **Done** |
| 6 | **Fabric Batches API** — `/api/fabric-batches`: `POST` creates a batch with an auto-generated sequential batch number (`FB-YYYY-####`, zero-padded). Uniqueness is guaranteed by the DB's UNIQUE index + a row lock (`SELECT ... FOR UPDATE`) inside a transaction, with automatic retry on any race; status defaults to `PENDING`, and the recording user comes from the session. `GET` lists batches newest-first with optional `status` and `search` (batch number or supplier) filters | ✅ **Done** |
| 7 | **Batch List (Collector)** — `/collector/batch-list`: live table of all batches (SWR polling every 8s), status pills + debounced supplier/batch-number search, skeleton loading & empty states, row count, gold "+ Record fabric" shortcut, and a detail modal per row showing every field of the batch | ✅ **Done** |
| 8 | Phase Board, Work Orders, POS (new sale / return+exchange / clients / due collection / invoice printing), batch traceability, Sales & Dues, Users — shipped after the initial milestone | ✅ **Done** |
| 9 | **Tier 1 updates** — `/api/phases` + `/api/products` (were 501 stubs), shared sortable `DataTable` component (used by Batch List, Users, Clients), server-side pagination + "Load more" on the Batch List, `app_settings` table + Owner-configurable bottleneck threshold via Dashboard → Settings | ✅ **Done** |
| 10+ | Tier 4 — audit trail, login rate-limiting & lockout, "change my password", session invalidation on password change, `mysqldump` backups + restore, Vitest + CI (lint/tsc/tests), `/api/health` + in-app sync indicator, DB index check | ✅ Done |
| 10+ | Next tiers (cost/margin tracking, WhatsApp dues reminders) | 🚧 Planned |

> **Auth system is ready:** users can log in at `/login`, sessions persist across refreshes, each role is redirected to its own home screen after sign-in, and `/owner`, `/collector`, `/operator` routes are protected so only the matching role can access them.
>
> **API note:** Next.js middleware skips `/api/*`, so every route handler verifies the session itself via `auth()` from `auth.ts` before touching the database.
>
> **Updating an existing database?** If you already created the database from the original schema, run `docs/tier1-updates.sql` once to add the `app_settings` table (used for the bottleneck threshold). Fresh installs get it from `docs/jamil-creations-schema.sql`.

## Getting Started

1. Copy `.env.example` to `.env` and fill in your MySQL credentials and `AUTH_SECRET`.
2. Create the database using `docs/jamil-creations-schema.sql` (optional seed data: `docs/jamil-creations-dummy-data.sql`).
3. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## Default Login Credentials

Use any account from the `users` table (email + password). Passwords are stored as bcrypt hashes. See "Managing Users" below for creating accounts.

## How Auth Works

- **Login:** custom credentials provider in `auth.ts` checks email + bcrypt password against the `users` table (only `ACTIVE` accounts).
- **Sessions:** signed JWT cookie (no session table needed). `id` and `role` are embedded into the token/session.
- **Route protection:** `middleware.ts` maps route prefixes to roles (`/owner` → OWNER, `/collector` → COLLECTOR, `/operator` → OPERATOR) and redirects wrong-role visitors to their own home area. Each server page re-checks with `requireRole()`/`auth()` as a safety net.
- **Helpers:** `lib/auth-helpers.ts` (`getCurrentUser`, `requireUser`, `requireRole`) for use inside server components/routes.

## Managing Users (Owner)

To add or update users later:

```sql
-- Add a new user (hash the password first!)
-- node -e "console.log(require('bcryptjs').hashSync('NewPass123', 12))"
INSERT INTO users (name, email, password_hash, role, status)
VALUES ('Rahim', 'rahim@jamil.com', '<bcrypt-hash>', 'OPERATOR', 'ACTIVE');

-- Change a password
UPDATE users SET password_hash = '<new-bcrypt-hash>' WHERE email = 'rahim@jamil.com';

-- Suspend a user (blocks login immediately)
UPDATE users SET status = 'SUSPENDED' WHERE email = 'rahim@jamil.com';

-- Change a user's role (takes effect on their next session)
UPDATE users SET role = 'COLLECTOR' WHERE email = 'rahim@jamil.com';
```

Or generate a hash quickly:

```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('YourPassword',12))"
```

The Owner → Users screen (`/owner/users`) is where a UI for this will live as it gets built out.

## Tier 4 — Reliability, Security & Operations

### Audit trail
Every phase change, user edit, sale/payment/return and password reset is recorded in the `audit_logs` table (who did what, on which record, with the full before/after detail payload). Browse it at **Owner → Audit Log** (`/owner/audit-log`); the `recorded_by_id` column present on every table is kept in sync too, so a row alone always tells you who created it. See `lib/audit.ts` and `app/api/audit-logs/route.ts`.

### Login rate-limiting & lockout
After `5` failed sign-ins for one email, that email is **locked for 15 minutes** (configurable in `lib/login-policy.ts`). The lockout is tracked per-email in the `login_attempts` table, so it survives a server restart. The login page (`/login`) explains the lock to the user with a `Try again in N minutes` message.

### Change your own password
Every role can change their own password at **My Account** (`/account/password`) in the sidebar — you must enter your current password first. (The Owner can still force-reset any account from the Users screen as before.)

### Sessions are signed out on password change
NextAuth uses signed JWT cookies, so simply changing a password doesn't end existing sessions. `users.session_version` is bumped on every password change (the Owner reset and the self-service change both do it); `auth.ts` compares the version in the token against the database on every request, and a mismatch clears the session. A walked-away/shared device is signed out on its next poll.

### Automated backups
`mysqldump` is wrapped in npm scripts so it works on both Windows and Linux without depending on `mysqldump` being on `PATH`:

```bash
npm run backup                 # timestamped dump -> backups/ (keeps last 14 days)
npm run backup -- --dry-run    # show the plan, write nothing
npm run backup -- --keep-days=30
npm run backup -- --name=pre-upgrade
npm run restore -- backups/<file>.sql
```

> ⚠️ **Images are NOT in this database** — fabric photos and product images live in your Cloudinary account, not in MySQL. A database restore gives you back the `image_url` values, but only Cloudinary holds the actual files. Keep the Cloudinary credentials in `.env.local` and never commit real credentials.

A read-only check that the Tier 4 schema is installed (`audit_logs`, `login_attempts`, `session_version` and the polling-path indexes) is bundled too:
```bash
npm run verify:tier4
```

### Tests + CI
```bash
npm test          # Vitest — pure logic only: batch-number generation, lockout policy, sales totals
npm run lint      # ESLint (next/core-web-vitals)
npm run typecheck # tsc --noEmit
```
GitHub Actions runs **typecheck → lint → test** on every PR (`.github/workflows/ci.yml`). The database-dependent logic (transactions, locks) is intentionally left to the retry layer rather than mocked, because that's where the real concurrency risk lives — see the inline docs in `app/api/fabric-batches/route.ts`.

### Health & error visibility
`GET /api/health` checks the database with a single `SELECT 1` and returns `{ status, database: { ok, latencyMs, error }, serverTime }` — `200` when the DB answers, `503` when it doesn't. The sidebar shows a live **System status** indicator (green = "Live", red = "Sync issue") next to sign-in, so a phase board that has silently stopped polling is immediately obvious.

### Migrations
Tier 4 schema additions (the `audit_logs`, `login_attempts` tables, `users.session_version`, and the `idx_work_orders_status` / `idx_sales_created_at` / `idx_clients_phone` indexes) are bundled as an idempotent migration script:
```bash
node scripts/migrate-tier4.cjs
```
Fresh installs pick everything up from `docs/jamil-creations-schema.sql` automatically.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js v5](https://authjs.dev/)

