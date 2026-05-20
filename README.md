# Qbit (MVP)

Simple interface on top of a legally structured financial record system for self-employed vehicle movement drivers.

## Stack

- Mobile: React Native (Expo)
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL

## Folder Structure

- `backend` API, tax logic, rules engine, deduction engine, SQL schema/seed
- `mobile` Expo app with This Week, Year Summary, Export screens
- `mobile-release` separate Expo + EAS project for iOS/Android release preparation

## Backend Run

1. `cd backend`
2. `cp .env.example .env`
3. `npm install`
4. `psql "$DATABASE_URL" -f sql/schema.sql`
5. `psql "$DATABASE_URL" -f sql/seed_rules.sql`
6. `npm run dev`

## Mobile Run

1. `cd mobile`
2. `npm install`
3. `npm start`

Set `API_BASE_URL` in `mobile/App.tsx` for device testing (for physical phones, use your machine LAN IP instead of localhost).

## Mobile Release Run

1. `cd mobile-release`
2. `cp .env.example .env`
3. `npm install`
4. Set `EXPO_PUBLIC_API_BASE_URL`
5. Set `APP_IOS_BUNDLE_IDENTIFIER` and `APP_ANDROID_PACKAGE` for real release builds
6. `npm start`

Release build commands in `mobile-release` now run a validation step before EAS builds. Preview builds allow default identifiers with warnings; production builds require real identifiers and a non-placeholder HTTPS API URL.
If you use EAS cloud builds, replace the placeholder env values in [mobile-release/eas.json](mobile-release/eas.json) as well.

## Implemented MVP Scope

- Weekly input only
- Expense and partial reimbursement handling
- Tax + NI calculation
- Year summary
- Export (JSON + CSV)

## API Endpoints

Public auth routes:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

Protected routes (Bearer token required):

- `POST /weekly-entry`
- `POST /receipts/upload` (multipart form-data: `weekly_entry_id`, `receipt`)
- `GET /receipts/:weeklyEntryId` (returns receipt metadata and short-lived `download_url`)
- `GET /receipts/:receiptId/download?token=...` (private download via signed token)
- `GET /rules/:taxYear/monitoring`
- `POST /rules/:taxYear/publish`
- `GET /admin/rules/:taxYear/audit-events?limit=50`
- `POST /admin/users/role`
- `GET /summary/:taxYear`
- `GET /tax-estimate/:weekId`
- `GET /export/:taxYear?format=json|csv`

## Compliance Notes

- Timestamped records
- Immutable entries (`is_locked = true`, no update endpoint)
- Categorised expenses
- Year-end totals persisted in `tax_summaries`
- Receipt uploads restricted by MIME type and size; private signed receipt downloads
- Rule-based monitoring output includes warnings and active rule version metadata
- Admin tooling routes require authenticated admin role (`role = admin`)

## Privacy

- User-facing privacy policy draft: [PRIVACY-POLICY.md](PRIVACY-POLICY.md)
- Account deletion request page draft: [ACCOUNT-DELETION.md](ACCOUNT-DELETION.md)
- GitHub Pages-ready account deletion HTML: [ACCOUNT-DELETION.html](ACCOUNT-DELETION.html)
- The policy reflects current collection, usage, storage, and deletion behavior implemented in the app and backend.

## Operations

- Production ops runbook (Railway backups, restore drill, and alerting): [ops/RAILWAY-PRODUCTION-RUNBOOK.md](ops/RAILWAY-PRODUCTION-RUNBOOK.md)
- Drill evidence helper script: [ops/scripts/railway-drill-evidence.sh](ops/scripts/railway-drill-evidence.sh)
- Alert smoke signal script: [ops/scripts/alerting-smoke-signals.sh](ops/scripts/alerting-smoke-signals.sh)
- Alerting thresholds and escalation plan: [ops/ALERTING-IMPLEMENTATION-PLAN.md](ops/ALERTING-IMPLEMENTATION-PLAN.md)
- Alert rollout execution checklist: [ops/ALERTING-ROLLOUT-CHECKLIST.md](ops/ALERTING-ROLLOUT-CHECKLIST.md)
- Latest production baseline evidence: [ops/DRILL-EVIDENCE-2026-04-23.md](ops/DRILL-EVIDENCE-2026-04-23.md)
- Alert test evidence: [ops/ALERTING-EVIDENCE-2026-04-23.md](ops/ALERTING-EVIDENCE-2026-04-23.md)
