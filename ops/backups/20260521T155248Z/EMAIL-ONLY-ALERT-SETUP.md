# Email-Only Alert Setup (401 Spike)

This setup adds lightweight alerting without a full monitoring platform.

## What It Does

- Every 5 minutes, GitHub Actions runs `ops/scripts/email-alert-monitor.js`.
- The script pulls Railway HTTP logs for `weekly-tax-app` in `production`.
- It checks the last 10 minutes for:
  - `POST /auth/login` with `401` (threshold default: `>=20`)
  - `GET /receipts/:id/download` with `401` (threshold default: `>=6`)
- If either threshold is breached, it sends an email through Resend.
- It tracks delivery SLO counters (`sent`, `delivered`, `bounced`, `pending`) in monitor logs.
- It applies cooldown suppression to avoid repeated alerts during long incidents.
- It can send escalation alerts to a secondary destination after repeated breaches.

## Files Added

- `.github/workflows/email-alert-monitor.yml`
- `ops/scripts/email-alert-monitor.js`

## Required GitHub Secrets

Set these in GitHub repository settings -> Secrets and variables -> Actions:

- `RAILWAY_TOKEN`
- `RESEND_API_KEY`
- `ALERT_FROM_EMAIL` (must be from a verified Resend domain/sender)
- `ALERT_TO_EMAIL`
- `ALERT_ESCALATION_TO_EMAIL` (optional secondary destination)

Sender format requirements:

- `ALERT_FROM_EMAIL` must be exactly one of:
  - `email@example.com`
  - `Name <email@example.com>`
- Do not wrap the value in quotes in GitHub Secrets.
- Example valid value: `Weekly Tax Alerts <alerts@yourdomain.com>`

## Optional Tuning

In `.github/workflows/email-alert-monitor.yml` env vars:

- `LOOKBACK_MINUTES` (default `10`, improves tolerance for Railway log ingestion delay)
- `LOG_LINES` (default `800`)
- `LOGIN_401_THRESHOLD` (default `20`)
- `DOWNLOAD_401_THRESHOLD` (default `6`)
- `MAX_EVENT_AGE_SECONDS` (default `240`) to suppress stale spikes
- `ALERT_COOLDOWN_SECONDS` (default `1800`) to suppress repeated sends during ongoing incidents
- `ALERT_BREACH_RESET_SECONDS` (default `3600`) window used for repeated-breach counting
- `ESCALATION_CONSECUTIVE_BREACHES` (default `3`) breach count before escalation alert is sent
- `ESCALATION_COOLDOWN_SECONDS` (default `3600`) minimum interval between escalation alerts
- `SLO_LOOKBACK_HOURS` (default `24`) for delivery SLO summary windows

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

## Risk Controls

- Stale-event suppression: alerts are sent only when the newest matching 401 event is within `MAX_EVENT_AGE_SECONDS`.
- Cooldown suppression: repeated alerts are suppressed for `ALERT_COOLDOWN_SECONDS` after a send.
- Persistent state cache: monitor state is restored/saved across workflow runs via GitHub Actions cache.
- Workflow overlap protection: GitHub Actions concurrency prevents parallel runs from double-sending.
- Least privilege: workflow permissions are set to read-only repository content.
- Timeout guardrail: workflow job timeout is limited to 10 minutes.
- Secret preflight: workflow fails early with a clear error if any required secret is missing.
- Provider swap: workflow now uses Resend (`RESEND_API_KEY`).
- Escalation policy: optional secondary alert destination can be triggered for repeated breaches.

## Notes

- This remains a lightweight monitor without persistent state.
- During a sustained ongoing incident, repeat alerts can still occur as new events continue to arrive.
