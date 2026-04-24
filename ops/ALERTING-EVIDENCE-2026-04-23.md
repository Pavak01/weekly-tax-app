# Alerting Evidence (2026-04-23)

## Execution Summary

- Date: 2026-04-23
- Runner: ops/scripts/alerting-smoke-signals.sh
- Modes executed: dry-run, live
- API base: https://weekly-tax-app-production.up.railway.app

## Planned Signals Verified

- Auth failure burst: 20 failed login requests planned
- Receipt download failure burst: 6 invalid token requests planned

## Evidence Output

Dry-run command executed:

```bash
./ops/scripts/alerting-smoke-signals.sh | tail -80
```

Observed result:

- Script produced all expected request lines in dry-run mode.
- No execution errors in shell run.

Live command executed:

```bash
ALERT_SMOKE_DRY_RUN=false LOGIN_FAIL_COUNT=20 DOWNLOAD_FAIL_COUNT=6 ./ops/scripts/alerting-smoke-signals.sh | tail -140
```

Live observed result:

- started_at_utc: 2026-04-23T16:10:21Z
- total status lines: 26
- status_401: 26
- status_429: 0
- status_500: 0

Interpretation:

- Auth failure and receipt download failure patterns were generated successfully.
- No server errors observed during signal generation.

## Railway Log-Derived Trigger Timing

Railway HTTP log query used:

```bash
npx --yes @railway/cli logs --http --json --service weekly-tax-app --environment production --lines 50
```

Observed smoke-run window from Railway logs:

- First failed login (401): 2026-04-23T16:10:21.665123159Z
- 20th failed login (threshold crossing for login-failure rule): 2026-04-23T16:10:33.428721219Z
- First failed receipt download (401): 2026-04-23T16:10:33.849476111Z
- Last failed receipt download (401): 2026-04-23T16:10:35.811911892Z

Practical trigger-time entry to use in evidence:

- Trigger time (UTC): 2026-04-23T16:10:33.428721219Z (threshold crossing proxy from Railway HTTP logs)

## Next Action

Railway agent retrieval summary for window `2026-04-23T16:09:00Z` to `2026-04-23T16:20:00Z`:

- matched_alert_count: 0
- No auth/download alert event found in Railway notifications for this window.
- Most recent Railway notifications were deployment failures from earlier in the day.
- Railway-side ack/resolved entries for the smoke signal are unavailable because no matching alert event exists.

Follow-up retrieval (same window) reported:

- matched_alert_count: 0
- HTTP logs API validation issue in Railway tooling: missing `upstreamErrors` field in response payload for some events.
- Result: Railway agent could not complete automated correlation despite known 401 timestamps captured previously.

Known 401 correlation timestamps (from prior successful HTTP log extraction):

- first_401_auth_login_at_utc: 2026-04-23T16:10:21.665123159Z
- twentieth_401_auth_login_at_utc: 2026-04-23T16:10:33.428721219Z
- first_401_receipt_download_at_utc: 2026-04-23T16:10:33.849476111Z
- last_401_receipt_download_at_utc: 2026-04-23T16:10:35.811911892Z

Status of required evidence fields:

- Trigger time: available via HTTP threshold-crossing proxy (`2026-04-23T16:10:33.428721219Z`).
- Destination received: unavailable in Railway for this smoke signal (no matching alert card/event).
- Acknowledged time: N/A.
- Resolved time: N/A.

External verification status (latest):

- Railway notifications in window 2026-04-23T16:09:00Z to 2026-04-23T16:20:00Z: none found.
- Railway alert tracking: no auth-login-failure-spike or receipt-download-failure-spike event found.
- Railway HTTP-log retrieval via agent: blocked by validation error on missing upstreamErrors field for some responses.

Configuration scope limitation:

- Notification destinations are configured at Railway project level, not service level.
- Service config API did not return destination mappings (Slack/PagerDuty/email/webhook).
- Destination verification therefore requires Railway Dashboard project settings or direct checks in external systems.

Outstanding evidence must come from external destinations:

- Slack channel delivery logs (Railway bot messages in-window).
- PagerDuty incident lifecycle details (opened, acknowledged, resolved).
- Email/webhook delivery confirmation in-window.

Latest operator confirmation:

- Email notification received for the smoke-test period (delivery confirmed by operator).
- Pending capture fields for final closure: received_at_utc, recipient address, subject line, and message ID/header evidence.

Temporary destination assignment (operator-approved):

- Destination type: email
- Destination recipient: roger.nichols@gmail.com
- Status: accepted as interim evidence until full email headers are captured.

Follow-up command to re-test after alert rules are explicitly enabled for auth/download failure patterns:

```bash
ALERT_SMOKE_DRY_RUN=false ./ops/scripts/alerting-smoke-signals.sh
```

## Copy/Paste Evidence Template

Use one block per alert event tied to this smoke run.

```text
Alert name:
Severity:
Railway alert URL:

Trigger time (UTC, Railway Opened):
Resolved time (UTC, Railway Recovered):

Destination config (Railway):
Destination received (channel/email):

Acknowledged time (UTC):
Acknowledged by:
Ack source (Slack/Teams/Pager):

Notes:
```

## Canary Alert Evidence Block (Fallback Path)

Use this block when validating delivery via a temporary canary rule.

```text
Canary alert name:
Canary rule created_at_utc:
Canary rule disabled_at_utc:

Smoke run start_at_utc:
Smoke run end_at_utc:

Expected destination type (email/slack/pager/webhook):
Destination configured value:

Email received_at_utc:
Email recipient:
Email subject:
Email message_id:

Correlation to smoke timestamps:
- first_401_auth_login_at_utc:
- twentieth_401_auth_login_at_utc:
- first_401_receipt_download_at_utc:
- last_401_receipt_download_at_utc:

Validation result (pass/fail):
Notes:
```

## Final Acceptance Criteria

Current state: interim complete, final alert-lifecycle verification pending.

- [x] Smoke signal requests executed in production.
- [x] Trigger-threshold proxy time derived from Railway HTTP logs.
- [ ] Matching Railway alert event found for auth/download smoke signal.
- [ ] Destination delivery confirmed for matching alert event.
- [ ] Ack and resolved lifecycle captured (or explicitly N/A with reason).

Definition of fully resolved:

1. A Railway alert event exists for the auth/download smoke run window.
2. Destination receipt is visible in configured channel/email.
3. Evidence block includes trigger, destination, ack, and resolved fields.

## Security Verification (2026-04-24)

Objective:

- Validate that previously issued/invalid token access is denied.
- Validate that an old/invalid rule publish secret is denied.
- Validate that the current rule publish secret is accepted.

Execution notes:

- Production endpoint base: https://weekly-tax-app-production.up.railway.app
- A temporary admin test user was created after setting a dedicated admin email and waiting for a successful deployment.
- The admin email variable was then restored to `roger.nichols@gmail.com`.

Results:

- Check 1 (invalid old-style JWT -> GET /rules/2026-27/monitoring): HTTP 401
- Check 2 (valid admin JWT + old/invalid `x-rule-publish-secret` -> GET /admin/rules/2026-27/audit-events?limit=1): HTTP 403
- Check 3 (valid admin JWT + current `x-rule-publish-secret` -> GET /admin/rules/2026-27/audit-events?limit=1): HTTP 200

Conclusion:

- Access control behavior matches expected post-rotation behavior for token and publish-secret checks.

## Post-Restore Runtime Verification (2026-04-24)

Deployment state after restoring `ADMIN_EMAILS`:

- Deployment ID: 58d68c49-f31d-4a25-9909-d696af6f7ec4
- Status: SUCCESS

Live checks:

- GET /health -> HTTP 200, body `{ "ok": true }`
- Auth sanity user registration -> HTTP 201
- Auth sanity user login -> HTTP 200
- Register response token present: yes
- Login response token present: yes

Result:

- Production runtime is healthy and DB-backed auth flow is operational after the config restore deployment.

## Incident Closeout (2026-04-24)

Scope closed:

- Secret-rotation validation and production runtime recovery
- Alerting evidence updates for smoke-run and fallback documentation
- Final production security behavior verification

Closeout checklist:

- [x] Invalid/old-style token denied (HTTP 401)
- [x] Old/invalid publish secret denied (HTTP 403)
- [x] Current publish secret accepted (HTTP 200)
- [x] Restore deployment completed successfully
- [x] Health endpoint confirmed (`/health` -> 200)
- [x] DB-backed auth path confirmed (register 201, login 200)
- [x] Temporary verification users removed from production

Temporary user cleanup record:

- Cleanup method: in-container DB query via Railway SSH on service `weekly-tax-app` (production)
- Deleted users:
	- `probe.1777055834@example.com`
	- `admin.check.1777056166@example.com`
	- `admin.verify.1777056265@example.com`
	- `sanity.1777056535@example.com`
- Post-cleanup verification: `remaining_temp_users = 0`

Operational status:

- Incident status: closed
- Remaining blocker for full original alert-lifecycle evidence: Railway-side event correlation gap for the specific smoke window (documented above), with fallback canary path retained.

## Alerting Capability Clarification (2026-04-24)

Clarification:

- Railway does not provide a built-in custom alert rule engine for application-level HTTP 401 spike thresholds in this project context.
- No external monitoring stack (Datadog/Grafana/New Relic/custom webhook monitor) was configured for this app.

Impact:

- No dedicated 401-spike alert email should be expected from the current configuration.
- The canary smoke runs validated signal generation only (request pattern and log evidence), not end-to-end alert delivery.

Recommended path to make alert-delivery verifiable:

- Configure one external monitor or alert pipeline source of truth.
- Route alerts to at least one destination (email or Slack).
- Re-run canary and capture destination, acknowledgment, and resolution evidence.

## Canary Re-Run Evidence (2026-04-24)

Execution command:

```bash
ALERT_SMOKE_DRY_RUN=false LOGIN_FAIL_COUNT=20 DOWNLOAD_FAIL_COUNT=6 ./ops/scripts/alerting-smoke-signals.sh
```

Smoke runner output summary:

- started_at_utc: 2026-04-24T18:59:38Z
- total_status_lines: 26
- status_401: 26
- status_429: 0
- status_500: 0

Railway HTTP log extraction (window `2026-04-24T18:59:37Z` to `2026-04-24T19:00:30Z`):

- matched_401_events: 26
- auth_login_401_events: 20
- receipt_download_401_events: 6

Correlation timestamps:

- first_401_auth_login_at_utc: 2026-04-24T18:59:38.496403648Z
- twentieth_401_auth_login_at_utc: 2026-04-24T18:59:45.431925650Z
- first_401_receipt_download_at_utc: 2026-04-24T18:59:45.817073187Z
- last_401_receipt_download_at_utc: 2026-04-24T18:59:47.596366904Z

Practical trigger proxy for evidence:

- trigger_time_proxy_utc: 2026-04-24T18:59:45.431925650Z (20th failed login threshold crossing)

Pending manual evidence capture to complete recommendation:

- destination_received_at_utc (email/slack/pager/webhook)
- destination_proof_reference (subject/message-id/URL)
- acknowledged_at_utc
- acknowledged_by
- resolved_at_utc
