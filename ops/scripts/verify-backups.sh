#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUPS_DIR="$ROOT_DIR/ops/backups"
DRILLS_DIR="$ROOT_DIR/ops/drills"
TS_COMPACT="$(date -u +"%Y%m%dT%H%M%SZ")"
TS_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
START_EPOCH="$(date +%s)"

OUTPUT_PATH="${BACKUP_VERIFY_OUTPUT_PATH:-$DRILLS_DIR/backup-verification-$TS_COMPACT.md}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$DRILLS_DIR"

failures=()
checks=()

add_result() {
  local status="$1"
  local context="$2"
  local description="$3"
  checks+=("$status|$context|$description")
  if [[ "$status" == "FAIL" ]]; then
    failures+=("[$context] $description")
  fi
}

run_check() {
  local context="$1"
  local description="$2"
  shift 2
  if "$@"; then
    echo "[PASS][$context] $description"
    add_result "PASS" "$context" "$description"
  else
    echo "[FAIL][$context] $description"
    add_result "FAIL" "$context" "$description"
  fi
}

check_restored_repo() {
  local context="$1"
  local repo_dir="$2"

  run_check "$context" "Repository restored" test -d "$repo_dir/.git"
  run_check "$context" "Workflow file present" test -f "$repo_dir/.github/workflows/email-alert-monitor.yml"
  run_check "$context" "Alert evidence file present" test -f "$repo_dir/ops/ALERTING-EVIDENCE-2026-04-23.md"
  run_check "$context" "Alert setup file present" test -f "$repo_dir/ops/EMAIL-ONLY-ALERT-SETUP.md"
  run_check "$context" "Monitor script syntax valid" node --check "$repo_dir/ops/scripts/email-alert-monitor.js" >/dev/null 2>&1
  run_check "$context" "Workflow guardrail MAX_EVENT_AGE_SECONDS=240" grep -q 'MAX_EVENT_AGE_SECONDS: "240"' "$repo_dir/.github/workflows/email-alert-monitor.yml"
  run_check "$context" "Alert setup includes RAILWAY_TOKEN" grep -q 'RAILWAY_TOKEN' "$repo_dir/ops/EMAIL-ONLY-ALERT-SETUP.md"
  run_check "$context" "Alert setup includes RESEND_API_KEY" grep -q 'RESEND_API_KEY' "$repo_dir/ops/EMAIL-ONLY-ALERT-SETUP.md"
  run_check "$context" "Alert setup includes ALERT_FROM_EMAIL" grep -q 'ALERT_FROM_EMAIL' "$repo_dir/ops/EMAIL-ONLY-ALERT-SETUP.md"
  run_check "$context" "Alert setup includes ALERT_TO_EMAIL" grep -q 'ALERT_TO_EMAIL' "$repo_dir/ops/EMAIL-ONLY-ALERT-SETUP.md"
}

echo "Starting backup verification..."
echo "Timestamp (UTC): $TS_ISO"

# 1) Verify current source via fresh bundle restore.
CURRENT_BUNDLE="$WORK_DIR/current-source-$TS_COMPACT.bundle"
CURRENT_RESTORE="$WORK_DIR/current-restore"

git -C "$ROOT_DIR" bundle create "$CURRENT_BUNDLE" --all >/dev/null 2>&1
git clone "$CURRENT_BUNDLE" "$CURRENT_RESTORE" >/dev/null 2>&1
if git -C "$CURRENT_RESTORE" rev-parse --verify main >/dev/null 2>&1; then
  git -C "$CURRENT_RESTORE" checkout main >/dev/null 2>&1
fi

check_restored_repo "current-source" "$CURRENT_RESTORE"

# 2) Verify latest archived backup restore.
LATEST_BACKUP_DIR="$(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)"
if [[ -z "$LATEST_BACKUP_DIR" ]]; then
  add_result "FAIL" "archived-backup" "No backup directories found in ops/backups"
else
  LATEST_BUNDLE="$(find "$LATEST_BACKUP_DIR" -maxdepth 1 -type f -name 'repo-*.bundle' -print | sort | tail -n 1)"
  MANIFEST="$LATEST_BACKUP_DIR/manifest.txt"
  ARCHIVE_RESTORE="$WORK_DIR/archived-restore"

  if [[ -z "$LATEST_BUNDLE" || ! -f "$LATEST_BUNDLE" ]]; then
    add_result "FAIL" "archived-backup" "No repo bundle found in latest backup directory"
  else
    git clone "$LATEST_BUNDLE" "$ARCHIVE_RESTORE" >/dev/null 2>&1
    if git -C "$ARCHIVE_RESTORE" rev-parse --verify main >/dev/null 2>&1; then
      git -C "$ARCHIVE_RESTORE" checkout main >/dev/null 2>&1
    fi

    check_restored_repo "archived-backup" "$ARCHIVE_RESTORE"

    if [[ -f "$MANIFEST" ]]; then
      expected_commit="$(grep '^backup_commit=' "$MANIFEST" | cut -d'=' -f2-)"
      restored_commit="$(git -C "$ARCHIVE_RESTORE" rev-parse HEAD)"
      if [[ -n "$expected_commit" && "$expected_commit" == "$restored_commit" ]]; then
        add_result "PASS" "archived-backup" "Restored commit matches manifest backup_commit"
      else
        add_result "FAIL" "archived-backup" "Restored commit does not match manifest backup_commit"
      fi
    else
      add_result "FAIL" "archived-backup" "Manifest file missing in latest backup directory"
    fi
  fi
fi

END_EPOCH="$(date +%s)"
DURATION="$((END_EPOCH - START_EPOCH))"
RESULT="PASS"
if [[ ${#failures[@]} -gt 0 ]]; then
  RESULT="FAIL"
fi

{
  echo "# Backup Verification Report ($TS_COMPACT)"
  echo
  echo "- Run date (UTC): $TS_ISO"
  echo "- Repository: $(basename "$ROOT_DIR")"
  echo "- Source branch: $(git -C "$ROOT_DIR" branch --show-current)"
  echo "- Source commit: $(git -C "$ROOT_DIR" rev-parse HEAD)"
  echo "- Latest archived backup: ${LATEST_BACKUP_DIR#"$ROOT_DIR/"}"
  echo "- Duration (seconds): $DURATION"
  echo "- Outcome: $RESULT"
  echo
  echo "## Checks"
  echo
  for item in "${checks[@]}"; do
    IFS='|' read -r status context description <<<"$item"
    echo "- [$status] ($context) $description"
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    echo
    echo "## Failures"
    echo
    for failure in "${failures[@]}"; do
      echo "- $failure"
    done
  fi
} > "$OUTPUT_PATH"

echo "report_path=$OUTPUT_PATH"
echo "result=$RESULT"

if [[ "$RESULT" == "FAIL" ]]; then
  exit 1
fi
