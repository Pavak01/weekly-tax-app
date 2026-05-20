# Go-Live Checklist

## Release Metadata

- Service: weekly-tax-app
- Environment: production
- Planned go-live date (UTC):
- Release owner:
- Operations owner:
- Backup reference: ops/backups/20260520T102324Z

## Pre-Flight

- [ ] Health endpoint returns HTTP 200.
- [ ] Auth/register/login smoke test passes.
- [ ] Alert workflow run completes successfully on main.
- [ ] Monitor step logs status alert_sent for a controlled spike test.
- [ ] Primary inbox receives alert email.
- [ ] Escalation destination is configured (if used).

## Security and Secrets

- [ ] RAILWAY_TOKEN present in GitHub Actions secrets.
- [ ] RESEND_API_KEY present and active.
- [ ] ALERT_FROM_EMAIL uses verified sender domain.
- [ ] ALERT_TO_EMAIL points to a real monitored inbox.
- [ ] Secret rotation owner and cadence documented.

## Reliability Controls

- [ ] MAX_EVENT_AGE_SECONDS set to production baseline (240).
- [ ] ALERT_COOLDOWN_SECONDS set and validated.
- [ ] Escalation thresholds reviewed and accepted.
- [ ] State cache restore/save steps working in workflow.
- [ ] Delivery SLO summary appears in workflow step summary.

## Evidence and Audit

- [ ] Alerting evidence updated with latest run ID and message ID.
- [ ] Delivery confirmation captured from inbox/provider activity.
- [ ] Incident/runbook links updated.
- [ ] Timestamped backup manifest recorded.

## Go/No-Go

- [ ] GO approved by release owner.
- [ ] GO approved by operations owner.
- [ ] Rollback owner assigned.

## Sign-Off

- Release owner sign-off:
- Operations owner sign-off:
- Date/time (UTC):
