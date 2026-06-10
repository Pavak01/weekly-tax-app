#!/usr/bin/env bash
set -euo pipefail

OWNER="Pavak01"
REPO="weekly-tax-app"
BRANCH="main"

if [[ -n "${1:-}" ]]; then
  GITHUB_TOKEN="$1"
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  read -r -s -p "Enter GITHUB_TOKEN (repo admin): " GITHUB_TOKEN
  echo
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is not set. Export it, pass as arg, or enter when prompted."
  echo "Example: GITHUB_TOKEN=... bash ops/scripts/apply-branch-protection-main.sh"
  exit 1
fi

echo "Applying branch protection to ${OWNER}/${REPO}:${BRANCH} ..."

put_response_file="$(mktemp)"
put_status="$({
curl -sS -o "${put_response_file}" -w "%{http_code}" -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
  -d @- <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "validate-release-policy",
      "PR Release Policy Check / validate-release-policy"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON
})"

if [[ "${put_status}" != "200" ]]; then
  echo "Failed to apply branch protection (HTTP ${put_status})."
  cat "${put_response_file}"
  rm -f "${put_response_file}"
  exit 1
fi

rm -f "${put_response_file}"

verify_response_file="$(mktemp)"
verify_status="$(curl -sS -o "${verify_response_file}" -w "%{http_code}" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection")"

if [[ "${verify_status}" != "200" ]]; then
  echo "Failed to verify branch protection (HTTP ${verify_status})."
  cat "${verify_response_file}"
  rm -f "${verify_response_file}"
  exit 1
fi

verify_json="$(cat "${verify_response_file}")"
rm -f "${verify_response_file}"

if ! echo "${verify_json}" | grep -q 'validate-release-policy'; then
  echo "Branch protection applied but required status check was not found in verification output."
  exit 1
fi

if ! echo "${verify_json}" | grep -q '"allow_force_pushes": {"enabled":false'; then
  echo "Branch protection verification failed: force pushes are not blocked."
  exit 1
fi

if ! echo "${verify_json}" | grep -q '"allow_deletions": {"enabled":false'; then
  echo "Branch protection verification failed: deletions are not blocked."
  exit 1
fi

echo "Branch protection applied and verified successfully."
echo "Required check includes validate-release-policy and force push/deletion are blocked."
