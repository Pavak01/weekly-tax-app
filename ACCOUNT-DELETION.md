# Account And Data Deletion Request (Draft)

Last updated: 20 May 2026

Use this page to request deletion of your Weekly Tax App account and associated data.

## How to request deletion

Email the support team with the subject line:

`Account Deletion Request`

Include:
- Account email address
- Your full name
- Confirmation statement: `I request permanent deletion of my Weekly Tax App account and associated data.`

Recommended contact email:
- `support@aplccommodities.com`

## What will be deleted

After identity verification, we will delete:
- Account profile data
- Weekly/monthly/daily entry records
- Expense records
- Receipt metadata and associated receipt files in active storage
- Tax summary records linked to the account

## What may be retained for a limited period

Some operational or legal records may be retained temporarily, including:
- Security and abuse-prevention logs
- Backup snapshots until scheduled rotation/expiry
- Records required by applicable law

## Verification and processing timeline

- We may request verification from the registered account email before processing.
- Standard processing target: within 30 days of verified request.

## If you only want to remove financial entries

Within the app Settings screen, you can:
- Clear current period data
- Clear all entry data

This may not delete your user account itself. Use the account deletion request process above for full account removal.

## Notes for Google Play Console setup

Use the public URL for this page in Play Console Account Deletion settings.

Repo-specific GitHub Pages URL pattern (once Pages is enabled):
- `https://pavak01.github.io/weekly-tax-app/ACCOUNT-DELETION.html`

Example public URL options:
- `https://yourdomain.com/delete-account`
- `https://<your-github-pages-domain>/<repo>/ACCOUNT-DELETION.html` (if you publish this page via GitHub Pages)

## GitHub Pages deployment checklist

1. Push this repository to GitHub with `ACCOUNT-DELETION.html` committed.
2. In repository Settings -> Pages, set Source to `GitHub Actions` (one-time setup).
3. Run workflow `Publish Account Deletion Page` from Actions tab (or push to `main`).
4. Wait for Pages to publish, then open:
	- `https://pavak01.github.io/weekly-tax-app/ACCOUNT-DELETION.html`
5. Paste the live URL into Google Play Console -> App content -> Account deletion.

---

Important: Verify legal retention wording with counsel before production publication.
