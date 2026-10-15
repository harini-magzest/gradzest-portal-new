# Protecting `main`

The checks in `.github/workflows` are only a safety net if GitHub refuses to merge when they fail. This page is the one
setting that makes them binding. It needs a repository **admin**; a contributor with write access cannot apply it.

## Before anything else: GitHub Actions has to be able to run

A required check that never reports blocks the merge forever. If a pull request shows every job failing in about two
seconds with no steps, open one and read its annotation. This is the message that means Actions cannot start jobs at all:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

That is a billing problem (**Settings → Billing & plans** on the account that owns the repository), not a code problem.
Fix it first, check that a pull request's checks run green, and only then turn on required checks. Doing it in the other
order makes every merge, including the one that would fix the problem, impossible.

## Why

Twice in a few days `main` went red because a merge kept an older copy of whole files (the line-ending change, #149,
undid #147 and removed the sign-in open-redirect guard until #151). CI caught both, but nothing stopped the merge, and
one pull request (#148) was merged while `backend-tests` was still running.

## What to turn on

**Settings → Branches → Add branch protection rule → Branch name pattern: `main`**

| Setting | Value |
|---|---|
| Require a pull request before merging | on |
| Require status checks to pass before merging | on |
| Require branches to be up to date before merging | **on** (this is what stops an old branch overwriting newer work) |
| Status checks that are required | the ten below |
| Do not allow force pushes | on |
| Do not allow deletions | on |
| Require approvals | your call: 1 if more than one person reviews, otherwise off |

Required status checks (the names GitHub shows on a pull request):

```
lint
typecheck-build
backend-tests
ui-tests
api-image
secret-scan
sast
actionlint
dep-audit (.)
dep-audit (server)
```

`e2e-smoke` (the browser tests) is deliberately **not** in the list until it has run green for a couple of weeks.

Both workflows run on every pull request with no path filters, so these checks always report and a required check can
never get stuck waiting for a job that was skipped.

## The same thing as one command

Run as an admin, from any folder (needs the GitHub CLI signed in with admin rights on the repository):

```bash
gh api -X PUT repos/harini-magzest/Gradzest-Portol/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "lint", "typecheck-build", "backend-tests", "ui-tests", "api-image",
      "secret-scan", "sast", "actionlint", "dep-audit (.)", "dep-audit (server)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

To require one approval as well, replace `"required_pull_request_reviews": null` with
`"required_pull_request_reviews": { "required_approving_review_count": 1 }`.

Check it took effect:

```bash
gh api repos/harini-magzest/Gradzest-Portol/branches/main/protection --jq '.required_status_checks.contexts'
```

## Two smaller settings in the same place

- **General → Pull Requests → Automatically delete head branches**: on. Merged branches stop piling up.
- **General → Pull Requests → Allow squash merging**: keep on; turn off merge commits if you want a linear history.

## If a required check name changes

Renaming a job in a workflow makes the old name wait forever and blocks every merge. Change the name here at the same
time: edit the list above, re-run the command, and merge the workflow change.
