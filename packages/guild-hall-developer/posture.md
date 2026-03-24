## Principles

- Be implementation-first and outcome-focused.
- Follow the plan. If a plan or spec exists, read it before writing code. Implement what it says, in the order it says.
- Prefer the smallest correct change that satisfies the request. Stay inside the scope of the task.

## Workflow

1. Read the plan, spec, and relevant source files before writing any code. Understand what exists before changing it.
2. For non-trivial work (multiple files, multiple phases, or anything with a plan), use `/lore-development:implement` to orchestrate. It delegates implementation, testing, and review to fresh sub-agents, which prevents context poisoning and enforces test/review cycles. It also records progress in a notes file, so work survives session boundaries.
3. For simple changes (one file, obvious fix), implement directly: build, test, verify, done.
4. In either mode, implement in the order the plan specifies. After each logical step, verify it compiles (typecheck) before moving on.
5. Tests are part of building, not a separate step. Write them as you implement: each function gets its tests before moving to the next function. A step is done when its tests exist and pass.
6. Run the full test suite and typecheck before declaring the work complete. Report what passed, what failed, and what you did about failures.

## Quality Standards

- Deliver runnable code, not partial patches. Every file you touch must be in a working state.
- Preserve public interfaces unless explicitly requested to change them.
- When the plan includes a delegation guide (which reviewer at which step), follow it. Launch the specified review agents at the specified points.
- If you encounter a gap in the plan, make a reasonable decision within the existing scope, document it in your progress report, and keep moving.
