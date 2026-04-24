# Email-Only Alert Setup (401 Spike)

This setup adds lightweight alerting without a full monitoring platform.

## What It Does

- Every 5 minutes, GitHub Actions runs `ops/scripts/email-alert-monitor.js`.
- The script pulls Railway HTTP logs for `weekly-tax-app` in `production`.
- It checks the last 5 minutes for:
  - `POST /auth/login` with `401` (threshold default: `>=20`)
  - `GET /receipts/:id/download` with `401` (threshold default: `>=6`)
- If either threshold is breached, it sends an email through Resend.

## Files Added

- `.github/workflows/email-alert-monitor.yml`
- `ops/scripts/email-alert-monitor.js`

## Required GitHub Secrets

Set these in GitHub repository settings -> Secrets and variables -> Actions:

- `RAILWAY_TOKEN`
- `RESEND_API_KEY`
- `ALERT_FROM_EMAIL` (must be from a verified Resend domain/sender)
- `ALERT_TO_EMAIL`

## Optional Tuning

In `.github/workflows/email-alert-monitor.yml` env vars:

- `LOOKBACK_MINUTES` (default `5`)
- `LOG_LINES` (default `800`)
- `LOGIN_401_THRESHOLD` (default `20`)
- `DOWNLOAD_401_THRESHOLD` (default `6`)

## Local Dry Run

Use this command to test parsing and threshold logic without sending email:

```bash
cd /Users/imac/income\ app
RAILWAY_TOKEN=<token> \
RAILWAY_SERVICE=weekly-tax-app \
RAILWAY_ENVIRONMENT=production \
LOOKBACK_MINUTES=60 \
LOGIN_401_THRESHOLD=1 \
DOWNLOAD_401_THRESHOLD=1 \
RESEND_API_KEY=dummy \
ALERT_FROM_EMAIL=dummy@example.com \
ALERT_TO_EMAIL=dummy@example.com \
DRY_RUN=true \
node ops/scripts/email-alert-monitor.js
```

Expected output includes `monitor_window` and `status alert_sent` in dry-run mode when thresholds are breached.

## Live Verification

1. Ensure secrets are set.
2. Run the workflow manually from the GitHub Actions tab (`Email Alert Monitor` -> `Run workflow`).
3. Trigger canary load:

```bash
cd /Users/imac/income\ app
ALERT_SMOKE_DRY_RUN=false LOGIN_FAIL_COUNT=20 DOWNLOAD_FAIL_COUNT=6 ./ops/scripts/alerting-smoke-signals.sh
```

4. Re-run workflow manually and confirm alert email receipt.

## Notes

- This is stateless and may send repeated alerts while spikes continue.
- If you need de-duplication/cooldown, add a persistence layer (Redis, KV, or issue/comment state) in a follow-up iteration.
