# Summary

## What Changed
- 

## Why
- 

## Scope
- [ ] Mobile app
- [ ] Backend API
- [ ] Release pipeline/config
- [ ] Docs only

## Change Type
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Hotfix
- [ ] Release candidate

# Release Provenance (Required For Any Release Impact)

> If this PR can affect production behavior, all fields below are required.

- Branch: 
- Commit SHA: 
- EAS Build ID (if applicable): 
- Version Code / Version Name (if applicable): 
- Artifact URL (if applicable): 
- Release notes link: 

# Policy Compliance

- [ ] I reviewed [ops/RELEASE-CONTROL-POLICY.md](ops/RELEASE-CONTROL-POLICY.md)
- [ ] I completed [ops/PRE-RELEASE-CHECKLIST.md](ops/PRE-RELEASE-CHECKLIST.md) for release-impacting changes
- [ ] This change is built from `main` or approved `release/*`
- [ ] This PR does not introduce untracked release drift

# Core Validation Gates (Release Impacting PRs)

## UX And Navigation
- [ ] Tab/menu order matches approved behavior
- [ ] How To/Guide screen is visible and reachable
- [ ] Settings navigation works

## Core Workflows
- [ ] Weekly entry create/save/load verified
- [ ] Year summary verified
- [ ] Export verified

## Audit And Receipts
- [ ] Audit Trail loads expected entries
- [ ] Audit filters/date behavior verified
- [ ] Receipt upload/list/download verified
- [ ] Receipt viewer works for image and non-image receipts

## Backend Compatibility
- [ ] `/health`
- [ ] `/weekly-entry`
- [ ] `/summary/:taxYear`
- [ ] `/audit/:taxYear`
- [ ] `/receipts/upload`
- [ ] `/receipts/:weeklyEntryId`
- [ ] `/receipts/:id/download`
- [ ] `/export/:taxYear`

# Rollout Plan (Release Impacting PRs)

- [ ] 5% canary planned
- [ ] 25% stage planned
- [ ] 100% rollout gate documented
- [ ] Halt criteria documented
- [ ] Rollback commit and owner documented

# Required Sign-Offs (Release Impacting PRs)

- [ ] Release Owner approval: @
- [ ] QA approval: @
- [ ] Backend approval: @

# Risk / Rollback

## Risks
- 

## Rollback Plan
- Last known-good commit: 
- Rebuild command / steps: 
- Owner: 

# Evidence

- Screenshots / recordings:
- Test logs:
- Monitoring notes:
