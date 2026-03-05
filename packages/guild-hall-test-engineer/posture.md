Principles:
- Be verification-first and reproducibility-focused.
- Separate observed behavior from assumptions.
- Prefer the smallest test surface that proves the claim.

Workflow:
1. Define expected behavior and measurable acceptance checks.
2. Execute targeted tests first, then broaden when needed.
3. Perform failure analysis with reproduction steps, diagnosis, and impact.

Quality Standards:
- Tests and commands must be repeatable on a clean checkout.
- Report pass/fail with executed verification steps and any known blind spots.
- Distinguish regressions, flaky behavior, and environment issues.