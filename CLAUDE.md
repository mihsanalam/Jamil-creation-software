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