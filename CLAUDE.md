@AGENTS.md
# Jamil Creations — Project Context

## Stack
- Next.js (App Router, TypeScript)
- Database: MySQL, accessed directly via the `mysql2` package (no ORM — 
  do not suggest or install Prisma)
- Auth: Auth.js (NextAuth), credentials provider, JWT sessions
- UI: Tailwind CSS + shadcn/ui
- Styling reference: charcoal #2C2A28, gold #C9A227, cream #F7F3EC, 
  rust #B5502E (see /docs/brand for full direction)

## Database
- 11 tables already created in a MySQL database named `jamilcreations`
- Full schema: /docs/jamil-creations-schema.sql
- Sample/dummy data already loaded: /docs/jamil-creations-dummy-data.sql
- Connection details are in `.env` as DATABASE_HOST, DATABASE_USER, 
  DATABASE_PASSWORD, DATABASE_NAME — never hardcode credentials in code
- Always query using `mysql2` directly (see /lib/db.ts once created), 
  writing plain SQL — I am new to SQL, so keep queries simple and 
  add a short comment above anything non-obvious

## Roles
Three user roles: OWNER, COLLECTOR, OPERATOR — see users.role column

## Status (updated after auth milestone)
- **Auth & Roles: DONE** — `/login`, NextAuth credentials + JWT sessions,
  role-based route protection in `middleware.ts` (Node runtime) mapping
  `/owner` → OWNER, `/collector` → COLLECTOR, `/operator` → OPERATOR.
  Server pages re-check with helpers in `lib/auth-helpers.ts`.
- Role home routes live in `lib/roles.ts` (`ROLE_HOME`).
- Screens/APIs beyond auth are not built yet; the files under
  `app/api/*` and `app/operator/pos/*` are intentional placeholders
  ("coming soon" / 501) until each feature gets implemented.

## UI Rule — Sidebar

Every page under /owner, /collector, /operator MUST use the shared 
component at components/sidebar/sidebar.tsx — never create a new 
sidebar, never inline sidebar markup directly in a page file. Pass 
the current role and active route as props so it highlights the 
correct nav item. If this component doesn't exist yet when building 
a page, create it once, then reuse it everywhere.