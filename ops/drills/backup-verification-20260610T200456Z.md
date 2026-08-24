# Backup Verification Report (20260610T200456Z)

- Run date (UTC): 2026-06-10T20:04:56Z
- Repository: income app
- Source branch: chore/release-governance
- Source commit: 305068f98e01a20727781a7730b4260135e79f07
- Latest archived backup: ops/backups/20260521T155248Z
- Duration (seconds): 1
- Outcome: PASS

## Checks

- [PASS] (current-source) Repository restored
- [PASS] (current-source) Workflow file present
- [PASS] (current-source) Alert evidence file present
- [PASS] (current-source) Alert setup file present
- [PASS] (current-source) Monitor script syntax valid
- [PASS] (current-source) Workflow guardrail MAX_EVENT_AGE_SECONDS=240
- [PASS] (current-source) Alert setup includes RAILWAY_TOKEN
- [PASS] (current-source) Alert setup includes RESEND_API_KEY
- [PASS] (current-source) Alert setup includes ALERT_FROM_EMAIL
- [PASS] (current-source) Alert setup includes ALERT_TO_EMAIL
- [PASS] (archived-backup) Repository restored
- [PASS] (archived-backup) Workflow file present
- [PASS] (archived-backup) Alert evidence file present
- [PASS] (archived-backup) Alert setup file present
- [PASS] (archived-backup) Monitor script syntax valid
- [PASS] (archived-backup) Workflow guardrail MAX_EVENT_AGE_SECONDS=240
- [PASS] (archived-backup) Alert setup includes RAILWAY_TOKEN
- [PASS] (archived-backup) Alert setup includes RESEND_API_KEY
- [PASS] (archived-backup) Alert setup includes ALERT_FROM_EMAIL
- [PASS] (archived-backup) Alert setup includes ALERT_TO_EMAIL
- [PASS] (archived-backup) Restored commit matches manifest backup_commit
