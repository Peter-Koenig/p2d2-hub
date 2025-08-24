# Merge Policy

This document defines the merge policy for the p2d2 repository.

## General Principles

- All changes must go through pull requests
- Code reviews are mandatory before merging
- Main branch should always be deployable
- Follow semantic versioning for releases

## Pull Request Requirements

### Before Submission
- [ ] Branch is up to date with target branch
- [ ] Code follows project conventions
- [ ] Tests are included and passing
- [ ] Documentation is updated if needed
- [ ] Changes are focused and atomic

### Review Process
- Minimum of 1 approved review required
- All CI checks must pass
- Code owner review required for sensitive areas
- Address all review comments before merging

## Merge Methods

### Preferred: Squash and Merge
- Use for feature branches
- Creates a single commit on target branch
- Clean commit history
- Commit message should follow conventional commits format

### Allowed: Rebase and Merge
- Use for keeping linear history
- Requires clean commit history
- Should be used sparingly

### Not Allowed: Merge Commit
- Creates merge commits that clutter history
- Not permitted except for special circumstances

## Branch Specific Policies

### Feature Branches → develop
- Squash and merge preferred
- Must be rebased before merging if conflicts exist

### Bugfix Branches → develop
- Same as feature branches
- Hotfixes may go directly to main if urgent

### develop → main
- Only through tagged releases
- Requires thorough testing
- Release notes must be provided

## Conflict Resolution

- Authors are responsible for resolving conflicts
- Rebase onto target branch to resolve
- Seek help if conflicts are complex

## Emergency Procedures

For critical fixes, administrators may bypass normal procedures with proper documentation and follow-up review.
