# Mobile Release App (Expo + EAS)

This folder is a separate release-focused mobile project for iOS and Android builds.

Screens:

- This Week
- Year Summary
- Export
- Admin
- Guide

Receipt workflow:

- Save a weekly entry, then upload receipt files.
- Tap any receipt in the list to download it with auth and open the native share sheet.

Admin tooling:

- Load active monitoring metadata for a tax year.
- Publish next rule version.
- View rule audit events.

Guide and FAQ:

- Includes quick onboarding steps and answers for common compliance questions.

Before running locally, ensure backend is running and set `EXPO_PUBLIC_API_BASE_URL` in `.env` when testing against a non-local backend.

## Release Setup

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to your deployed backend.
2. Set `APP_IOS_BUNDLE_IDENTIFIER` and `APP_ANDROID_PACKAGE` to your real app identifiers before production builds.
3. Install dependencies:
	npm install
4. Log in to Expo:
	npx expo login
5. Configure EAS project if needed:
	npx eas init
6. Start locally if needed:
	npm start

If you plan to use EAS cloud builds, also replace the placeholder `APP_IOS_BUNDLE_IDENTIFIER`, `APP_ANDROID_PACKAGE`, and `EXPO_PUBLIC_API_BASE_URL` values in `eas.json` for each build profile you intend to use.

## Build Commands

- Android preview APK: `npm run build:android:preview`
- Android production AAB: `npm run build:android:production`
- iOS preview build: `npm run build:ios:preview`
- iOS production build: `npm run build:ios:production`

Each build command now runs a release validation step first. It resolves `EXPO_PUBLIC_API_BASE_URL` in this order: shell environment, `eas.json` build-profile env, local `.env`, then `app.json`. It will stop the build if that resolved value is still set to `localhost`, `127.0.0.1`, `api.example.com`, or left empty.

For `production` builds, validation is stricter: placeholder iOS bundle identifiers and Android package names such as `com.weeklytaxapp.mobile` or `com.yourcompany.*` are treated as errors rather than warnings. Those identifiers can now be supplied through shell env, `.env`, or EAS profile env using `APP_IOS_BUNDLE_IDENTIFIER` and `APP_ANDROID_PACKAGE`.

Manual validation commands:

- Preview validation: `npm run validate:release:preview`
- Production validation: `npm run validate:release:production`

## Notes

- Set final `APP_IOS_BUNDLE_IDENTIFIER` and `APP_ANDROID_PACKAGE` before store submission.
- Add real app icons and splash assets before store release.
- Replace the placeholder API URL and app identifiers in `.env` or `eas.json` before attempting cloud builds.
- This folder is intentionally isolated from `mobile/` so release prep does not affect active development.

## GitHub + Railway (No Domain)

If Railway is connected to your GitHub repo, you can run release validation and optional EAS builds from GitHub Actions.

Workflow file:

- `.github/workflows/mobile-release-validate.yml`

Add these GitHub repository secrets:

- `RAILWAY_PREVIEW_API_URL`
- `RAILWAY_PRODUCTION_API_URL`
- `IOS_BUNDLE_ID_PREVIEW`
- `IOS_BUNDLE_ID_PRODUCTION`
- `ANDROID_PACKAGE_PREVIEW`
- `ANDROID_PACKAGE_PRODUCTION`
- `EXPO_TOKEN` (required only when running EAS build in the workflow)

Then run the workflow manually from the Actions tab:

1. Open **Mobile Release Validate**.
2. Click **Run workflow**.
3. Keep `run_build=false` to validate only, or set `run_build=true` to trigger EAS build.
