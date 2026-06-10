# Pre-Release Checklist (One Page)

Release ID: ____________________
Date: ____________________
Release Branch: ____________________
Commit SHA: ____________________
EAS Build ID: ____________________
Version Code / Name: ____________________
Release Owner: ____________________
QA Approver: ____________________
Backend Approver: ____________________

## A) Provenance and Scope

- [ ] Built from `main` or approved `release/*` branch
- [ ] Commit SHA recorded and matches build
- [ ] Build URL recorded
- [ ] Release notes written (what changed / did not change)
- [ ] Risk notes documented

## B) UX and Navigation

- [ ] Tab/menu order matches approved order
- [ ] How To / Guide screen is visible and reachable
- [ ] Settings navigation works

## C) Core App Flows

- [ ] Sign in and sign out work
- [ ] Weekly entry create/save/load works
- [ ] Daily/weekly/monthly mode behavior validated (if applicable)
- [ ] Year Summary loads
- [ ] Export works

## D) Audit and Receipts

- [ ] Audit Trail loads expected entries for seeded test user
- [ ] Audit filters/date behavior validated
- [ ] Receipt upload works
- [ ] Receipt opens in viewer for image receipts
- [ ] Receipt opens/downloads for non-image receipts (PDF/text)

## E) Backend Compatibility Smoke

- [ ] `/health`
- [ ] `/weekly-entry`
- [ ] `/summary/:taxYear`
- [ ] `/audit/:taxYear`
- [ ] `/receipts/upload`
- [ ] `/receipts/:weeklyEntryId`
- [ ] `/receipts/:id/download`
- [ ] `/export/:taxYear`

## F) Rollout Gates

- [ ] Canary rollout (5%) complete without P0/P1 regressions
- [ ] Stage rollout (25%) complete without P0/P1 regressions
- [ ] Approved for 100% rollout

## G) Rollback Readiness

- [ ] Last known-good commit SHA documented
- [ ] Rollback build command documented
- [ ] Rollback owner assigned
- [ ] User communication draft prepared

## H) Final Sign-off

- [ ] Release Owner approved
- [ ] QA Approver approved
- [ ] Backend Approver approved
- [ ] Go-Live decision recorded

Decision:
- [ ] GO
- [ ] NO-GO

Notes:

__________________________________________________________________
__________________________________________________________________
__________________________________________________________________
