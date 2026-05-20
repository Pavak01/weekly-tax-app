#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUPS_DIR="$ROOT_DIR/ops/backups"
DRILLS_DIR="$ROOT_DIR/ops/drills"

if [[ ! -d "$BACKUPS_DIR" ]]; then
  echo "error: backups directory not found at $BACKUPS_DIR" >&2
  exit 1
fi

pick_latest_backup() {
  local latest
  latest="$(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)"
  if [[ -z "$latest" ]]; then
    echo "error: no backup folders found under $BACKUPS_DIR" >&2
    exit 1
  fi
  printf "%s" "$latest"
}

BACKUP_INPUT="${1:-latest}"
if [[ "$BACKUP_INPUT" == "latest" ]]; then
  BACKUP_DIR="$(pick_latest_backup)"
elif [[ "$BACKUP_INPUT" == /* ]]; then
  BACKUP_DIR="$BACKUP_INPUT"
else
  BACKUP_DIR="$ROOT_DIR/$BACKUP_INPUT"
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "error: backup directory does not exist: $BACKUP_DIR" >&2
  exit 1
fi

BUNDLE_PATH="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'repo-*.bundle' -print | sort | tail -n 1)"
if [[ -z "$BUNDLE_PATH" ]]; then
  echo "error: no repo bundle found in $BACKUP_DIR" >&2
  exit 1
fi

TIMESTAMP_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TS_COMPACT="$(date -u +"%Y%m%dT%H%M%SZ")"
OWNER="${USER:-unknown}"

mkdir -p "$DRILLS_DIR"
DRILL_FILE="$DRILLS_DIR/restore-drill-$TS_COMPACT.md"

BACKUP_DIR_REL="${BACKUP_DIR#"$ROOT_DIR/"}"
BUNDLE_REL="${BUNDLE_PATH#"$ROOT_DIR/"}"

cat > "$DRILL_FILE" <<EOF
# Restore Drill Record ($TS_COMPACT)

## Metadata

- Drill date (UTC): $TIMESTAMP_UTC
- Drill owner: $OWNER
- Observer/reviewer:
- Source backup folder: $BACKUP_DIR_REL
- Source bundle: $BUNDLE_REL
- Reference checklist: ops/MONTHLY-RESTORE-DRILL-CHECKLIST.md

## Execution Log

- Start time (UTC): $TIMESTAMP_UTC
- Commands executed:
  - git clone $BUNDLE_REL restore-test
  - cd restore-test
  - git branch -a
  - git checkout main
- Validation notes:

## Outcome

- End time (UTC):
- Total restore duration:
- Outcome: Pass/Fail
- Issues found:
- Follow-up owner:
- Follow-up due date:

## Sign-Off

- Drill owner sign-off:
- Reviewer sign-off:
- Date/time (UTC):
EOF

echo "created: $DRILL_FILE"
echo "backup:  $BACKUP_DIR_REL"
echo "bundle:  $BUNDLE_REL"
