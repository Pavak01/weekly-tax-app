# Mobile Regression Checklist

Run this checklist before each production mobile build.

## Authentication

- App launches to sign-in when no valid session exists.
- App auto-restores session on relaunch when a valid session exists.
- Session expiry forces sign-in again.

## Entry Workflow

- Entry mode tabs display in order: Daily, Weekly, Monthly.
- New entry form fields load blank on first launch.
- Save flow works in Daily mode.
- Save flow works in Weekly mode.
- Save flow works in Monthly mode.

## Data Deletion

- Clear current period deletes only the selected period.
- Clear all data deletes all entries and related receipts.
- After clear-all and app relaunch, deleted entry data does not reappear.
- After clear-all, user remains signed in.

## Summary and Export

- Year summary loads valid values for current tax year.
- Export JSON succeeds.
- Export CSV succeeds.

## Receipts

- Upload receipt succeeds for a saved entry.
- Uploaded receipt appears in receipt list.
- Receipt download/view works.

## Release Sanity

- Production release validation passes.
- Android build completes and produces an .aab artifact.
