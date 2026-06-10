# Release Control Policy

Status: Active
Owner: Release Manager (named per release)
Scope: Mobile app, backend API, and production release operations
Last updated: 2026-06-10

## 1) Policy Goal

Prevent release drift, preserve predictable app behavior, and ensure every production artifact is fully traceable to a reviewed code snapshot.

## 2) Core Rules

1. Single source of truth
- Production releases must be built from `main` or an approved `release/*` branch cut from `main`.
- Building from ad-hoc worktrees, detached heads, or unknown local states is prohibited.

2. Immutable provenance
- Every release artifact must have:
  - Commit SHA
  - Branch name
  - EAS build ID and URL
  - Version code/version name
  - Release notes summary
- Artifacts without complete provenance are not eligible for rollout.

3. Branch discipline
- Release branches are named `release/<version-or-date>`.
- Only scoped release fixes are allowed on release branches.
- Release-branch fixes must be merged back into `main` after release.

4. No hidden drift
- No direct production behavior changes without a pull request and reviewer approval.
- Emergency changes still require post-incident PR and changelog entry.

5. Coordinated app/backend compatibility
- Any app change that depends on backend behavior must document the expected API contract.
- If backend behavior is changed, compatibility checks are mandatory before rollout.

## 3) Environment and Build Rules

1. Build environment parity
- Use the production build profile only for production candidates.
- Ensure required environment variables are present and validated.

2. Versioning
- Version code must always increase.
- Rollbacks are done by rebuilding a known-good commit with a new version code.
- Re-uploading an old artifact as-is is not the rollback standard.

3. Release manifests
- Each release must include a short manifest with:
  - What changed
  - What did not change
  - Risks
  - Validation evidence links

## 4) Mandatory Validation Gates

A release cannot proceed beyond canary without passing all gates:

1. Navigation and UX gates
- Tab/menu order matches approved order.
- How To / Guide screen is present and reachable.

2. Core workflow gates
- Weekly entry create/save/load behavior passes.
- Audit Trail loads expected entries for test accounts.
- Receipt viewer opens both image and non-image receipts.
- Export and summary flows pass.

3. Security and auth gates
- Sign-in/out, token expiry handling, and role-gated screens behave correctly.

4. Backend compatibility gates
- `/weekly-entry`, `/audit/:taxYear`, `/summary/:taxYear`, `/receipts/*`, `/export/:taxYear` smoke checks pass.

## 5) Rollout Policy

1. Staged rollout only
- Phase 1: 5%
- Phase 2: 25%
- Phase 3: 100%
- Advance only when no blocking regressions are observed.

2. Halt criteria
- Any P0/P1 regression in core workflows (entry, audit, receipts, auth) halts rollout immediately.

3. Rollback trigger
- If halt criteria are met, execute rollback runbook:
  - Rebuild last known-good commit with incremented version code
  - Validate with the same pre-release checklist
  - Resume staged rollout

## 6) Stabilization Freeze Rule

If two consecutive production releases regress core user flows:

1. Initiate a 48-hour stabilization freeze.
2. Allow only P0/P1 fixes.
3. Require expanded validation evidence before any new rollout.

## 7) Roles and Approvals

Required approvals before production rollout:

1. Release Owner
- Confirms provenance, manifest, and rollout plan.

2. QA Approver
- Confirms checklist completion and evidence.

3. Backend Approver
- Confirms API compatibility and operational readiness.

No production rollout is allowed without all three approvals.

## 8) Exceptions

Any policy exception must be documented in release notes with:

1. Reason for exception
2. Risk assessment
3. Explicit sign-off from Release Owner and QA Approver
4. Follow-up corrective action and due date
