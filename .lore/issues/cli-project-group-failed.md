---
title: "CLI Project Group Failed"
date: 2026-04-02
status: resolved
---

The register project CLI did not add the group when it was applied as an argument. I see it in the help, but it didn't actually work.

**Fix:** In `cli/index.ts` lines 138-144, the path resolution logic for register commands was creating a new array with only the first two positional args (name and resolved path), discarding any additional args like the group. Updated to use spread operator to preserve all args beyond the first two: `[positionalArgs[0], path.resolve(positionalArgs[1]), ...positionalArgs.slice(2)]`