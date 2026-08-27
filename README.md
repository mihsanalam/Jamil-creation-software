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
| 8+ | Remaining screens (Phase Board, POS, Reports, Users management, …) | 🚧 In progress |

> **Auth system is ready:** users can log in at `/login`, sessions persist across refreshes, each role is redirected to its own home screen after sign-in, and `/owner`, `/collector`, `/operator` routes are protected so only the matching role can access them.
>
> **API note:** Next.js middleware skips `/api/*`, so every route handler verifies the session itself via `auth()` from `auth.ts` before touching the database.

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

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js v5](https://authjs.dev/)

