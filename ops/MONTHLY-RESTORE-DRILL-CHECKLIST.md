# Monthly Restore Drill Checklist

## Drill Metadata

- Drill date (UTC):
- Drill owner:
- Observer/reviewer:
- Source backup folder: ops/backups/20260520T102324Z
- Source bundle: ops/backups/20260520T102324Z/repo-20260520T102324Z.bundle

## Preparation

- [ ] Create isolated temporary directory.
- [ ] Confirm enough disk space for full clone + checkout.
- [ ] Confirm git is available in runner machine.

## Restore Steps

- [ ] Clone from bundle:
  - git clone ops/backups/20260520T102324Z/repo-20260520T102324Z.bundle restore-test
- [ ] Enter restore repository and list branches.
- [ ] Checkout target branch (main).
- [ ] Verify backup manifest values:
  - backup_timestamp_utc
  - backup_commit
  - backup_branch
- [ ] Validate key files exist in restored repo:
  - .github/workflows/email-alert-monitor.yml
  - ops/ALERTING-EVIDENCE-2026-04-23.md
  - ops/EMAIL-ONLY-ALERT-SETUP.md

## Functional Validation

- [ ] Run syntax check for monitor script:
  - node --check ops/scripts/email-alert-monitor.js
- [ ] Confirm workflow file contains expected freshness guardrail (MAX_EVENT_AGE_SECONDS=240).
- [ ] Confirm alert setup doc references required secrets.

## Recovery Time and Outcome

- [ ] Start time captured (UTC).
- [ ] End time captured (UTC).
- [ ] Total restore duration recorded.
- [ ] Outcome: Pass/Fail.
- [ ] Any blockers or manual fixes documented.

## Post-Drill Actions

- [ ] Evidence file updated with drill result.
- [ ] Follow-up actions assigned with owner and due date.
- [ ] Next monthly drill scheduled.

## Sign-Off

- Drill owner sign-off:
- Reviewer sign-off:
- Date/time (UTC):
