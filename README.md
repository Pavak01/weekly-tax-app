# Weekly Tax App (MVP)

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

## Mobile Release Validate (GitHub Actions)

The [Mobile Release Validate](.github/workflows/mobile-release-validate.yml) workflow validates release configuration secrets before an optional EAS build.

### Required GitHub Secrets

Set the following secrets in **Settings → Secrets and variables → Actions** before running the workflow:

| Secret | Description |
|---|---|
| `RAILWAY_PREVIEW_API_URL` | HTTPS URL of the preview Railway deployment |
| `IOS_BUNDLE_ID_PREVIEW` | iOS bundle identifier for the preview build (e.g. `com.yourcompany.weeklytaxapp.preview`) |
| `ANDROID_PACKAGE_PREVIEW` | Android package name for the preview build (e.g. `com.yourcompany.weeklytaxapp.preview`) |
| `RAILWAY_PRODUCTION_API_URL` | HTTPS URL of the production Railway deployment |
| `IOS_BUNDLE_ID_PRODUCTION` | iOS bundle identifier for the production build (e.g. `com.yourcompany.weeklytaxapp`) |
| `ANDROID_PACKAGE_PRODUCTION` | Android package name for the production build (e.g. `com.yourcompany.weeklytaxapp`) |
| `EXPO_TOKEN` | Expo access token — only required when `run_build` is `true` |

### Running the workflow

Once the relevant secrets are set, go to **Actions → Mobile Release Validate → Run workflow** and select:

- **validate_target**: `preview` *(or `production` / `both`)*
- **run_build**: unchecked / `false` *(check only if you want to trigger an EAS cloud build)*

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
