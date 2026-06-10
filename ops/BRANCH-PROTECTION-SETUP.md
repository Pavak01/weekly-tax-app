# Branch Protection Setup

This repository now includes a release policy check workflow:

- Workflow file: `.github/workflows/pr-release-policy-check.yml`
- Required check job name: `validate-release-policy`

Use the script below to enforce branch protection on `main` so the check is required before merge.

## Prerequisites

1. A GitHub personal access token with `repo` and admin rights on the repository.
2. Export it in your shell:

```bash
export GITHUB_TOKEN="<your-token>"
```

## Apply Protection

From repo root:

```bash
bash ops/scripts/apply-branch-protection-main.sh
```

If your shell session does not persist exported variables, use one-command inline mode:

```bash
GITHUB_TOKEN="<your-token>" bash ops/scripts/apply-branch-protection-main.sh
```

The script also supports secure interactive token entry if `GITHUB_TOKEN` is not set.

## What This Enables

1. Requires pull request reviews before merge.
2. Dismisses stale approvals on new commits.
3. Requires status check `validate-release-policy` to pass.
4. Enforces up-to-date branch before merge (`strict=true`).
5. Prevents force pushes and branch deletion.

## Verify

Open repository settings:

1. Settings
2. Branches
3. Branch protection rules for `main`

Confirm `validate-release-policy` is listed under required checks.
