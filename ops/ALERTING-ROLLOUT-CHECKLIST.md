# Alerting Rollout Checklist (Production)

Use this checklist to convert the alerting plan into live rules and capture implementation proof.

Source threshold definitions: [ops/ALERTING-IMPLEMENTATION-PLAN.md](ops/ALERTING-IMPLEMENTATION-PLAN.md)

## Pre-flight

- [ ] Confirm on-call owner for this rollout window.
- [ ] Confirm Railway alert destinations are configured and reachable (team channel, email, optional pager).
- [ ] Open [ops/RAILWAY-PRODUCTION-RUNBOOK.md](ops/RAILWAY-PRODUCTION-RUNBOOK.md) for response playbook links.

## Rule Creation

### A. Availability and API

- [ ] Health endpoint alert: `/health` non-200 for 2 checks in 2 minutes (`critical`).
- [ ] API 5xx ratio alert: >5% over 5 minutes (`high`).
- [ ] p95 latency alert: >1500 ms over 10 minutes (`medium`).

### B. Auth and security

- [ ] Login failure spike alert: `/auth/login` failures >=20 in 5 minutes (`high`).
- [ ] 2FA verify failure spike alert: `/auth/verify-2fa` failures >=15 in 10 minutes (`medium`).
- [ ] Admin 403 spike alert: `/admin/*` 403 >=10 in 10 minutes (`medium`).

### C. Receipt pipeline

- [ ] Upload failure rate alert: `/receipts/upload` non-2xx >10% in 10 minutes (`high`).
- [ ] Download failure rate alert: `/receipts/:receiptId/download` non-2xx >5% in 10 minutes (`high`).

### D. Database

- [ ] DB connection error alert: >=5 connection exceptions in 5 minutes (`critical`).
- [ ] DB disk usage alert: >=80% sustained for 15 minutes (`high`).
- [ ] DB CPU/memory alert: >=90% sustained for 10 minutes (`high`).

## Routing Verification

- [ ] `critical` alerts open in Railway and route to on-call destination.
- [ ] `high` alerts open in Railway and route to engineering destination.
- [ ] `medium` alerts open in Railway and route to engineering destination.
- [ ] Alert payload includes runbook links.

## Controlled Trigger Tests

- [ ] Trigger one health-check alert in a safe maintenance window.
- [ ] Trigger one auth-failure pattern with test credentials.
- [ ] Trigger one receipt failure signal using an invalid upload/download scenario.
- [ ] Validate acknowledgement and time-to-notification.

Helper script for controlled auth/receipt signal generation:

```bash
chmod +x ./ops/scripts/alerting-smoke-signals.sh
./ops/scripts/alerting-smoke-signals.sh
```

To execute real requests (instead of dry-run), run:

```bash
ALERT_SMOKE_DRY_RUN=false ./ops/scripts/alerting-smoke-signals.sh
```

## Best-Resolution Execution (Railway)

Use this flow to reach final closure for auth/download alert validation:

1. In Railway Dashboard, create or enable alert rules specifically for:
	- `/auth/login` failure spike (threshold: >=20 failures in 5 minutes).
	- `/receipts/:receiptId/download` failure spike (threshold: >5% non-2xx in 10 minutes).
2. Confirm destinations are attached to both rules (engineering channel/email; optional pager for critical paths).
3. Re-run the live smoke script:
	- `ALERT_SMOKE_DRY_RUN=false LOGIN_FAIL_COUNT=20 DOWNLOAD_FAIL_COUNT=6 ./ops/scripts/alerting-smoke-signals.sh`
4. In Railway notifications/alert history, capture matching alert events in the same time window.
5. Record evidence in `ops/ALERTING-EVIDENCE-2026-04-23.md` using the template block.

Pass criteria for this execution:

- [ ] At least one Railway alert event matches the auth or receipt smoke signal window.
- [ ] Trigger time is recorded from Railway event (or justified proxy if Railway event timestamp is unavailable).
- [ ] Destination receipt is confirmed in the configured channel/email.
- [ ] Resolved time is captured (or documented as still open).
- [ ] Ack field is captured from incident workflow, or marked N/A with reason.

## Fallback Validation (When Alert History Is Missing)

Use this method if Railway notifications or API queries do not show matching events reliably.

1. Create a temporary canary alert rule in Railway with a unique name including UTC date/time.
2. Scope it to a signal you can intentionally trigger (for example auth 401 spike on `/auth/login`).
3. Set a low temporary threshold so one controlled run reliably opens the alert.
4. Route it to a single known email destination.
5. Run live smoke test immediately after creating the canary rule.
6. Capture the email evidence: received time (UTC), recipient, subject, and message ID.
7. Disable/delete the canary rule after evidence capture.

Pass criteria for fallback validation:

- [ ] Canary alert name appears in received email subject/body.
- [ ] Email timestamp falls inside the smoke-run validation window.
- [ ] Recipient matches configured destination.
- [ ] Evidence block in `ops/ALERTING-EVIDENCE-2026-04-23.md` is filled with these fields.

Railway agent prompt (copy/paste after each live smoke run):

```text
Query scope
Project: gracious-serenity
Environment: production
Service: weekly-tax-app
Time window (UTC): <START_UTC> to <END_UTC>

Return fields for any alert/event tied to auth failures or receipt download failures:
- alert_name
- severity
- opened_at_utc
- recovered_at_utc (or null)
- source_signal
- destination_configured
- destination_received
- event_url
- event_id

Acknowledgement fields:
- ack_at_utc
- ack_by
- ack_source

If no ack concept exists, return exactly:
ack_at_utc: null
ack_by: "N/A"
ack_source: "N/A - Railway alert event has no acknowledgement field"

Correlate with HTTP logs in same window and return:
- first_401_auth_login_at_utc
- twentieth_401_auth_login_at_utc
- first_401_receipt_download_at_utc
- last_401_receipt_download_at_utc

Output:
- one JSON object per matching alert
- matched_alert_count: X

If no matching alert events:
matched_alert_count: 0
reason: "No Railway alert event found for auth/download 401 spike in window"
```

## Evidence Capture

Store proof in an ops evidence file with:

- alert name
- trigger time
- resolved time
- severity
- routed destinations
- owner
- root cause (for real incidents) or test condition (for drills)
- corrective action

Field retrieval source (Railway-first):

- Trigger time: Railway Dashboard alert "Opened" timestamp.
- Resolved time: Railway Dashboard alert "Recovered" timestamp.
- Destination: Railway alert destination config + actual channel that received notification.
- Ack time: first human acknowledgement in the incident channel (or pager ack if integrated).

Suggested file naming:

- `ops/ALERTING-EVIDENCE-YYYY-MM-DD.md`

## Rollout Completion

- [ ] Mark operational alerting priority complete in [SECURITY-TODO.md](SECURITY-TODO.md) only after all required rules are active.
- [ ] Schedule quarterly alert-path test on calendar.
- [ ] Share completion summary in team channel.

## Email-Only External Monitor (Practical Path)

Use this when no external alerting platform is currently configured.

- [ ] Configure GitHub repository secrets: `RAILWAY_TOKEN`, `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`.
- [ ] Enable and run workflow `.github/workflows/email-alert-monitor.yml` manually once.
- [ ] Trigger canary with `ALERT_SMOKE_DRY_RUN=false LOGIN_FAIL_COUNT=20 DOWNLOAD_FAIL_COUNT=6 ./ops/scripts/alerting-smoke-signals.sh`.
- [ ] Re-run workflow and confirm email delivery.
- [ ] Capture delivery metadata in `ops/ALERTING-EVIDENCE-2026-04-23.md`.

Setup reference:

- `ops/EMAIL-ONLY-ALERT-SETUP.md`
