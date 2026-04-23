---
title: "TypeScript Practices: Compendium Research"
status: resolved
date: 2026-03-23
tags: [typescript, compendium, type-safety, testing, bun]
---

# TypeScript Practices: Compendium Research

## Summary

Research on established TypeScript patterns, pitfalls, and community conventions for distillation into a compendium reference entry. Sources include the TypeScript handbook, Google's TypeScript style guide, and community practice from established OSS projects.

## 1. Type System Patterns That Prevent Bugs

### Discriminated Unions

Discriminated unions use a common literal property (the discriminant) to let TypeScript narrow types in control flow. They are the primary tool for modelling variant data.

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };
```

Switching on `kind` narrows the type within each branch. The compiler knows `radius` exists only when `kind === "circle"`.

**Source:** [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

### Exhaustive Checks with `never`

Adding a default branch that assigns to `never` turns missed cases into compile errors:

```typescript
function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.radius ** 2;
    case "square": return shape.side ** 2;
    default:
      const _exhaustive: never = shape;
      return _exhaustive;
  }
}
```

When a new variant is added to the union, every switch without a case for it fails to compile. This is the mechanism that makes discriminated unions safe at scale.

**Source:** [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

### Branded Types

TypeScript uses structural typing: two types with the same shape are interchangeable. Branded types add a phantom property to create nominal distinction at compile time with zero runtime cost.

```typescript
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };

function createUserId(id: string): UserId { return id as UserId; }
```

A `UserId` cannot be passed where an `OrderId` is expected, despite both being strings at runtime. Guild Hall uses this pattern for `MeetingId`, `CommissionId`, and `SdkSessionId` in `apps/daemon/types.ts`.

**Source:** [Learning TypeScript: Branded Types](https://www.learningtypescript.com/articles/branded-types); [Prosopo: TypeScript Branding](https://prosopo.io/articles/typescript-branding/)

### The `satisfies` Operator

`satisfies` validates that a value conforms to a type without widening the inferred type. This matters when you want both validation and preserved literal types.

```typescript
const routes = {
  home: "/",
  about: "/about",
  user: "/user/:id",
} satisfies Record<string, string>;
// routes.home is typed as "/" (literal), not string
```

Compare with type annotation (`const routes: Record<string, string> = { ... }`), which widens all values to `string`.

**When to use:** Config objects, lookup tables, and anywhere you want the compiler to verify shape without losing specificity. Don't overuse; default to type annotations for most declarations. `satisfies` earns its keep on complex objects where literal types or narrowed inference matters.

**Source:** [TypeScript 4.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html); [Total TypeScript: Clarifying satisfies](https://www.totaltypescript.com/clarifying-the-satisfies-operator); [2ality: The satisfies operator](https://2ality.com/2025/02/satisfies-operator.html)

## 2. Common Pitfalls

### Type Assertions Hiding Errors

`as` and `!` are escape hatches that silence the compiler without runtime checks. Google's style guide calls them explicitly unsafe:

> "Type assertions (`x as SomeType`) and non-nullability assertions (`y!`) are unsafe. Both only silence the TypeScript compiler, but do not insert any runtime checks."

**Guidance:** Prefer narrowing (type guards, `instanceof`, `in` checks) over assertions. When assertions are unavoidable, add a comment explaining why the compiler is wrong. Never use `!` without a comment.

**Source:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### `any` Leaking

`any` defeats the type system wherever it appears and propagates silently. A single `any` in a function signature can make the return type `any`, infecting callers without triggering errors.

**Guidance:** Use `unknown` when a value is genuinely untyped. `unknown` forces narrowing before use. Suppress `any` warnings only in tests, with documented justification. `@ts-expect-error` (never `@ts-ignore`) for known compiler limitations.

**Source:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### Enum Issues

TypeScript enums have several sharp edges:
- `const enum` is fragile across compilation boundaries (Google bans it outright)
- Numeric enums allow reverse mapping, creating confusion
- Enums don't participate cleanly in union narrowing
- Boolean coercion of enum values (`!!myEnum`) is unreliable for zero-valued members

**Guidance:** Prefer union types (`type Status = "pending" | "complete"`) or `as const` objects. When enums are already in use, compare explicitly (`status !== Status.NONE`), never coerce to boolean.

**Source:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### Incorrect Generic Constraints

Uninitialized generics default to `unknown`, which callers then have to fight. Overly loose constraints (`T extends object`) fail to prevent misuse.

**Guidance:** Specify generic type parameters explicitly when the inference isn't obvious. Initialize generic collections with types: `new Set<string>()`, not `new Set()`.

**Source:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

## 3. Community Conventions

### Union Types over Enums

Widely adopted across the TypeScript community. Union types compose with the rest of the type system (mapped types, conditional types, template literals) in ways enums cannot. `as const` objects provide the same runtime-value-to-type mapping when you need both.

### `unknown` over `any`

The TypeScript team, Google, and most community style guides agree: `unknown` is the safe alternative to `any`. The distinction is enforcement. `any` turns off checking; `unknown` forces you to narrow before accessing properties.

### Explicit Return Types on Public APIs

Community is split. Google's guide makes it optional ("reviewers may ask for annotations to clarify complex return types"). The general consensus: explicit return types on exported functions and public methods; inferred types acceptable for local/private functions. Explicit return types prevent accidental API changes when refactoring internal logic.

### Interfaces vs Type Aliases

Google's guide: "use interfaces instead of a type alias for the object literal expression." Interfaces have better IDE support and error messages. Reserve `type` for unions, intersections, tuples, mapped types, and conditional types. Both are valid; pick one convention for object shapes and enforce it.

**Source:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### Mapped and Conditional Types: Use Sparingly

Google's guide cautions against complex type gymnastics:

> "A little bit of repetition or verbosity is often much cheaper than the long term cost of complex type expressions."

Utility types (`Partial`, `Pick`, `Omit`, `Record`) are fine. Custom multi-level conditional types are a maintenance liability.

## 4. Strict Mode: Real Bugs vs Ceremony

Guild Hall runs `"strict": true` in tsconfig.json. The `strict` flag enables a bundle of checks. The ones that catch the most real bugs:

| Flag | What it catches | Ceremony level |
|------|----------------|----------------|
| `strictNullChecks` | Null/undefined dereference (the #1 JS runtime error category) | Low. Almost always catches real bugs. |
| `noImplicitAny` | Untyped function parameters silently becoming `any` | Low. Prevents the `any` leak problem. |
| `strictFunctionTypes` | Contravariant parameter checking on callbacks | Medium. Catches real bugs in event handlers and callbacks. |
| `noUncheckedIndexedAccess` | Array/object index returns `T \| undefined` | Medium-high. Catches real bugs but adds ceremony on every array access. Not part of `strict`; must be enabled separately. |
| `strictPropertyInitialization` | Class fields not assigned in constructor | Medium. Useful for classes, noise in DI-heavy code. |
| `noImplicitReturns` | Missing return in branches | Low. Straightforward. |

**Verdict:** `strictNullChecks` and `noImplicitAny` are non-negotiable; they catch entire categories of runtime errors. `noUncheckedIndexedAccess` is high value but high friction. A GitHub issue (#49169) to include it in `strict` was declined by the TypeScript team due to the migration cost. Worth enabling on new projects.

**Source:** [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/); [GitHub Issue #49169](https://github.com/microsoft/TypeScript/issues/49169); [Huon Wilson: TypeScript strictness is non-monotonic](https://huonw.github.io/blog/2025/12/typescript-monotonic/)

## 5. Testing Patterns

### Dependency Injection over Module Mocking

Module mocking (`jest.mock()`, `mock.module()`) is brittle: it couples tests to import paths, makes refactoring fragile, and in Bun's case can cause infinite loops. The alternative is dependency injection: functions accept their dependencies as parameters.

```typescript
// Instead of importing directly and mocking the import:
function processData(data: string, clock: () => Date = () => new Date()) {
  return { processed: data, timestamp: clock() };
}

// Test:
const fixedClock = () => new Date("2026-01-01");
expect(processData("test", fixedClock).timestamp).toEqual(new Date("2026-01-01"));
```

This is the established pattern in Guild Hall (see CLAUDE.md testing section) and aligns with broader community practice.

**Source:** [Bun Testing Docs](https://bun.com/docs/test/mocks); [GitHub Discussion #6236](https://github.com/oven-sh/bun/discussions/6236)

### Type-Level Tests

For libraries or code with complex generic types, compile-time type tests prevent type regressions:

- **`expect-type`**: Fluent API for compile-time assertions. `expectTypeOf<MyFn>().returns.toEqualTypeOf<string>()`. Works in any test runner.
- **`tsd`**: Separate `.test-d.ts` files parsed for type assertions. Good for `.d.ts` validation.
- **`@ts-expect-error`**: Lightweight. Verifies that invalid usage produces an error. No library needed.

```typescript
// @ts-expect-error: UserId should not accept OrderId
const user: UserId = orderId;
```

When to use type-level tests: when the type is the API (branded types, generic utilities, discriminated union factories). Not needed for application-level code where runtime tests already exercise the types.

**Source:** [2ality: Testing types in TypeScript](https://2ality.com/2025/02/testing-types-typescript.html); [expect-type GitHub](https://github.com/mmkal/expect-type); [Total TypeScript: How to test your types](https://www.totaltypescript.com/how-to-test-your-types)

### Bun-Specific Testing Considerations

- **`mock.module()` is off limits.** Bun's module mocking can cause infinite loops and has scope leakage across test files (Issue #12823). This is documented in Guild Hall's CLAUDE.md and the project's setup rules.
- **`spyOn` works fine.** Use `spyOn(object, "method")` to mock methods on objects passed via DI. This is reliable in Bun.
- **No `jest.fn()` import.** Use `mock()` from `bun:test` for function stubs.
- **Test isolation.** Bun runs test files in separate workers by default, but module mocks can leak. DI avoids this entirely.

**Source:** [Bun Test Docs](https://bun.com/docs/test/mocks); [Bun Issue #12823](https://github.com/oven-sh/bun/issues/12823)

## 6. Additional Conventions Worth Noting

### `@ts-expect-error` over `@ts-ignore`

Google bans `@ts-ignore` entirely. `@ts-expect-error` is allowed only in tests with justification. The difference: `@ts-expect-error` fails if the error it suppresses is fixed, preventing stale suppressions.

### Wrapper Types

Never use `String`, `Boolean`, `Number` (capitalized). These are the JavaScript wrapper objects, not the primitives. Use lowercase `string`, `boolean`, `number`.

### Mutable Exports

`export let` is disallowed in Google's guide. Use getter functions for values that change.

### Error Suppression

`@ts-expect-error` should include a comment explaining what error is expected and why suppression is necessary. Bare suppressions are technical debt.

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Discriminated unions + exhaustive checks prevent missed cases | **Verified** | TypeScript handbook, compiler behavior |
| Branded types have zero runtime cost | **Verified** | TypeScript compilation output, multiple sources agree |
| `satisfies` preserves literal types while validating | **Verified** | TypeScript 4.9 release notes, tested behavior |
| `mock.module()` causes infinite loops in Bun | **Verified** | Guild Hall experience, Bun GitHub issues |
| Google bans `const enum` | **Verified** | Google TypeScript Style Guide text |
| `noUncheckedIndexedAccess` catches real bugs | **Verified** | TypeScript docs, GitHub discussion #49169 |
| Community prefers unions over enums | **High confidence** | Multiple style guides, OSS patterns, but not universal |
| Explicit return types on public APIs is consensus | **Moderate** | Google says optional; community leans toward explicit for exports |
