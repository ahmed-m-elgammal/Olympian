# Branch Protection Rules

For the `main` branch:
1. **Require a pull request before merging**:
   - Require at least 1 approval from a designated code owner (`CODEOWNERS`).
   - Dismiss stale pull request approvals when new commits are pushed.
2. **Require status checks to pass before merging**:
   - Require branches to be up to date before merging.
   - Status checks required:
     - `test` (GitHub Actions CI)
3. **Require conversation resolution before merging**:
   - All review comments must be resolved.
4. **Do not allow force pushes or deletions**.
