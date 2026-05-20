#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
START_EPOCH="$(date +%s)"
TS_COMPACT="$(date -u +"%Y%m%dT%H%M%SZ")"
TS_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

OUTPUT_PATH="${DRILL_OUTPUT_PATH:-$ROOT_DIR/ops/drills/automated-restore-drill-$TS_COMPACT.md}"
WORK_DIR="$(mktemp -d)"
BUNDLE_PATH="$WORK_DIR/repo-$TS_COMPACT.bundle"
RESTORE_DIR="$WORK_DIR/restore-test"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$(dirname "$OUTPUT_PATH")"

failures=()

add_failure() {
  failures+=("$1")
}

run_check() {
  local description="$1"
  shift
  if "$@"; then
    echo "[PASS] $description"
  else
    echo "[FAIL] $description"
    add_failure "$description"
  fi
}

echo "Starting automated restore drill..."
echo "Timestamp (UTC): $TS_ISO"

git -C "$ROOT_DIR" bundle create "$BUNDLE_PATH" --all >/dev/null 2>&1

git clone "$BUNDLE_PATH" "$RESTORE_DIR" >/dev/null 2>&1
if git -C "$RESTORE_DIR" rev-parse --verify main >/dev/null 2>&1; then
  git -C "$RESTORE_DIR" checkout main >/dev/null 2>&1
fi

run_check "Repository restored from bundle" test -d "$RESTORE_DIR/.git"
run_check "Workflow file present" test -f "$RESTORE_DIR/.github/workflows/email-alert-monitor.yml"
run_check "Alert evidence file present" test -f "$RESTORE_DIR/ops/ALERTING-EVIDENCE-2026-04-23.md"
run_check "Alert setup file present" test -f "$RESTORE_DIR/ops/EMAIL-ONLY-ALERT-SETUP.md"
run_check "Monitor script syntax valid" node --check "$RESTORE_DIR/ops/scripts/email-alert-monitor.js" >/dev/null 2>&1
run_check "Workflow guardrail MAX_EVENT_AGE_SECONDS=240" grep -q 'MAX_EVENT_AGE_SECONDS: "240"' "$RESTORE_DIR/.github/workflows/email-alert-monitor.yml"
run_check "Alert setup includes required secrets" grep -q 'RAILWAY_TOKEN' "$RESTORE_DIR/ops/EMAIL-ONLY-ALERT-SETUP.md"
run_check "Alert setup includes RESEND_API_KEY" grep -q 'RESEND_API_KEY' "$RESTORE_DIR/ops/EMAIL-ONLY-ALERT-SETUP.md"
run_check "Alert setup includes ALERT_FROM_EMAIL" grep -q 'ALERT_FROM_EMAIL' "$RESTORE_DIR/ops/EMAIL-ONLY-ALERT-SETUP.md"
run_check "Alert setup includes ALERT_TO_EMAIL" grep -q 'ALERT_TO_EMAIL' "$RESTORE_DIR/ops/EMAIL-ONLY-ALERT-SETUP.md"

END_EPOCH="$(date +%s)"
DURATION="$((END_EPOCH - START_EPOCH))"

RESULT="PASS"
if [[ ${#failures[@]} -gt 0 ]]; then
  RESULT="FAIL"
fi

{
  echo "# Automated Restore Drill Report ($TS_COMPACT)"
  echo
  echo "- Drill date (UTC): $TS_ISO"
  echo "- Repository: $(basename "$ROOT_DIR")"
  echo "- Branch at source: $(git -C "$ROOT_DIR" branch --show-current)"
  echo "- Source commit: $(git -C "$ROOT_DIR" rev-parse HEAD)"
  echo "- Bundle path (temp): $BUNDLE_PATH"
  echo "- Restore duration (seconds): $DURATION"
  echo "- Outcome: $RESULT"
  echo
  if [[ ${#failures[@]} -eq 0 ]]; then
    echo "## Checks"
    echo
    echo "All checks passed."
  else
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
