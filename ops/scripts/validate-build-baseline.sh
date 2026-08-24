#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
backup_root="$repo_root/ops/backups"

if [[ ! -d "$backup_root" ]]; then
  echo "[FAIL] Backup directory missing: $backup_root"
  exit 1
fi

latest_backup_dir="$(ls -1dt "$backup_root"/*/ 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest_backup_dir" ]]; then
  echo "[FAIL] No backup snapshots found in $backup_root"
  exit 1
fi

manifest_file="${latest_backup_dir}manifest.txt"
if [[ ! -f "$manifest_file" ]]; then
  echo "[FAIL] Latest backup manifest not found: $manifest_file"
  exit 1
fi

backup_commit="$(awk -F= '/^backup_commit=/{print $2}' "$manifest_file")"
if [[ -z "$backup_commit" ]]; then
  echo "[FAIL] backup_commit is missing in $manifest_file"
  exit 1
fi

current_commit="$(git rev-parse HEAD)"
current_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$current_commit" == "$backup_commit" ]]; then
  echo "[PASS] Build baseline check passed"
  echo "latest_backup_dir=$latest_backup_dir"
  echo "required_backup_commit=$backup_commit"
  echo "current_branch=$current_branch"
  echo "current_commit=$current_commit"
  exit 0
fi

echo "[FAIL] Build baseline check failed"
echo "latest_backup_dir=$latest_backup_dir"
echo "required_backup_commit=$backup_commit"
echo "current_branch=$current_branch"
echo "current_commit=$current_commit"
echo "Hint: checkout the exact latest backup commit before production build."
exit 1
