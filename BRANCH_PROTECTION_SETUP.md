# GitHub Branch Protection Setup Guide

**Purpose:** Enforce code review and CI checks on all changes to `main` branch

**Time Required:** 5 minutes

**Access Required:** Repository admin or owner on GitHub

---

## Step-by-Step Setup

### 1. Navigate to Repository Settings

1. Go to GitHub: https://github.com/Pavak01/weekly-tax-app
2. Click **Settings** tab (top right)
3. Left sidebar → **Branches**

### 2. Add Branch Protection Rule

1. Click **Add rule** button
2. **Branch name pattern:** Enter `main`
3. Click **Create**

### 3. Configure Protection Rules

Enable these checkboxes:

#### ✅ Require a pull request before merging
- Check: **Require pull request reviews before merging**
- Number of approvals: `1` (minimum)
- Check: **Dismiss stale pull request approvals when new commits are pushed**
- Check: **Require review from Code Owners** (optional, if CODEOWNERS file exists)

#### ✅ Require status checks to pass before merging
- Check: **Require branches to be up to date before merging**
- Search for and select status checks:
  - `TypeScript Compilation` (if CI configured)
  - `Tests` (if CI configured)
  - Any other required checks

#### ✅ Other recommended settings
- Check: **Include administrators** (prevents even admins from bypassing)
- Check: **Restrict who can push to matching branches** (optional - limits who can push)
- Check: **Allow force pushes** → Select **Dismiss**: (prevents force push)
- Check: **Allow deletions** → Unchecked (prevents accidental branch deletion)

### 4. Save Settings

Click **Save changes** button at bottom of page

---

## Verification

**To verify protection is active:**

1. Go to repo main page
2. Look for **Branches** section
3. Should show `main` with a shield icon 🔒
4. Click on `main` to see protection details

---

## How This Affects Workflow

**Before (without protection):**
```
git merge feature-branch
git push origin main
✅ Direct push allowed (risky)
```

**After (with protection):**
```
git push origin feature-branch
↓
Create Pull Request on GitHub
↓
Code review required (1 approval)
↓
CI checks must pass
↓
Merge via GitHub UI only
✅ Enforced correctness
```

---

## For Future Releases

### Proper v85+ Workflow:

1. **Create feature branch**
   ```bash
   git checkout -b feat/v85-feature
   ```

2. **Make changes, commit, push**
   ```bash
   git push -u origin feat/v85-feature
   ```

3. **Open Pull Request on GitHub**
   - Compare: `feat/v85-feature` → `main`
   - Add description (what changed, why, testing)
   - Request reviewer (if team members)

4. **Wait for:**
   - ✅ Code review approval
   - ✅ CI checks pass (TypeScript, tests)
   - ✅ No conflicts with main

5. **Merge via GitHub UI**
   - Click **Merge pull request**
   - Provides audit trail and history

---

## Why This Matters

| Without Protection | With Protection |
|---|---|
| ❌ Direct pushes to main | ✅ All changes via PR |
| ❌ No code review | ✅ Peer review required |
| ❌ CI checks skipped | ✅ Automated checks enforced |
| ❌ No audit trail | ✅ Full change history |
| ❌ Easy to break main | ✅ Main stays stable |

---

## Troubleshooting

**"I can't push to main directly anymore"**
- This is correct behavior ✅
- Use PR workflow instead (see above)

**"Protection rule not showing"**
- Refresh page
- Check you have admin access
- Verify rule was saved (should show confirmation)

**"I need to bypass protection"**
- Use **Dismiss reviews** option (if enabled for admins)
- Or request exception from team lead
- Temporarily disable rule (not recommended)

---

## Questions?

If protection rules cause issues:
1. Check this guide first
2. Verify all settings match above
3. Test with a test branch before main

---

**Status:** Ready to apply before v84 build

**Next Step:** Complete setup above, then build v84
