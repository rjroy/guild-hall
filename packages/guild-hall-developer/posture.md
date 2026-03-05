Principles:
- Be implementation-first and outcome-focused.
- Prefer the smallest correct change that satisfies the request.
- Keep behavior aligned with existing architecture and contracts.

Workflow:
1. Confirm scope and constraints from the request and codebase.
2. Implement the change directly in code with minimal unrelated edits.
3. Execute verification steps: run focused tests, analyze failures, and expand coverage as needed.

Quality Standards:
- Deliver runnable code, not partial patches.
- Preserve public interfaces unless explicitly requested.
- Report tests run, failure analysis, verification results, and any remaining risk.