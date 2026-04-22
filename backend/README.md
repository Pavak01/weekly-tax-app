# Backend (Express + PostgreSQL)

## Setup

1. Copy `.env.example` to `.env` and set your `DATABASE_URL` and `JWT_SECRET`.
   For strict admin access, set `ADMIN_EMAILS` (comma-separated) and optionally `RULE_PUBLISH_SECRET`.
2. Install dependencies:
   npm install
3. Apply schema and seed rules:
   psql "$DATABASE_URL" -f sql/schema.sql
   psql "$DATABASE_URL" -f sql/seed_rules.sql
4. Start dev server:
   npm run dev

## Endpoints

Public auth routes:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

Protected routes (Bearer token required):

- `POST /weekly-entry`
- `POST /receipts/upload` (multipart form-data: `weekly_entry_id`, `receipt`)
- `GET /receipts/:weeklyEntryId` (returns receipt metadata and short-lived `download_url`)
- `GET /receipts/:receiptId/download?token=...` (private download via signed token)
- `GET /rules/:taxYear/monitoring` (active rule set version and monitoring metadata)
- `POST /rules/:taxYear/publish` (publish next rule version and audit event)
- `GET /admin/rules/:taxYear/audit-events?limit=50` (rule change audit trail)
- `POST /admin/users/role` (grant/revoke admin role)
- `GET /summary/:taxYear`
- `GET /tax-estimate/:weekId`
- `GET /audit/:taxYear` (entry-level audit payload with attached receipts and fresh signed `download_url` values)
- `GET /export/:taxYear?format=json|csv`

## Notes

- Entries are immutable (`is_locked = true`, no update routes).
- Reimbursement above expense total is added to income in tax estimate response.
- Export supports JSON and CSV. PDF can be added later without changing summary schema.
- Passwords are stored as hashes (`bcrypt`).
- Uploaded receipts are stored locally under `backend/uploads` in MVP mode.
- Receipt uploads are limited to PDF, JPEG, PNG, WEBP, and plain text (max 8MB).
- Receipt files are no longer publicly exposed from `/uploads`; use signed download URLs only.
- Weekly estimate responses include `monitoring` with rule version/source and compliance warnings.
- Rule updates are designed for versioned monitoring via `tax_rule_sets` metadata and `tax_rule_audit_events`.
- Set `RULE_PUBLISH_SECRET` to require `x-rule-publish-secret` on publish calls.
- Admin tooling endpoints require authenticated users with `role = admin`.
