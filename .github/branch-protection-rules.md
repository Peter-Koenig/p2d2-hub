# Branch Protection Rules

This document outlines the branch protection rules for the p2d2 repository.

## Protected Branches

### main Branch
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators
- ✅ Restrict who can push to matching branches
- ✅ Allow force pushes: ❌ Disabled
- ✅ Allow deletions: ❌ Disabled

### develop Branch
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators
- ✅ Allow force pushes: ❌ Disabled
- ✅ Allow deletions: ❌ Disabled

## Status Checks Requirements

Required status checks must pass before merging:
- ✅ Linting checks
- ✅ Unit tests
- ✅ Build verification
- ✅ Security scanning

## Review Requirements

- Minimum number of reviewers: 1
- Dismiss stale pull request approvals when new commits are pushed
- Require review from Code Owners

## Exception Handling

In case of emergencies, administrators can temporarily override protections with proper documentation.
