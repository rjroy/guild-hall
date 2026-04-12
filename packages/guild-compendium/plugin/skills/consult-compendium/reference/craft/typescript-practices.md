---
title: TypeScript Practices
domain: typescript-practices
last_updated: 2026-03-24
source: "research commission (Verity, 2026-03-24)"
---

# TypeScript Practices

TypeScript's type system is a tool for preventing bugs at compile time. The difference between TypeScript that catches real errors and TypeScript that just adds ceremony comes down to choosing the right patterns and avoiding the common traps.

## Type Patterns That Prevent Bugs

**Discriminated unions.** Use a common literal property (the discriminant) to model variant data. Switching on the discriminant narrows the type within each branch. The compiler knows which fields exist in each case.

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };
```

**Exhaustive checks with `never`.** A default branch that assigns to `never` turns missed cases into compile errors. When a new variant is added to the union, every switch without a case for it fails to compile. This makes discriminated unions safe at scale.

**Branded types.** TypeScript uses structural typing, so two types with the same shape are interchangeable. Branded types add a phantom property to create nominal distinction at compile time with zero runtime cost. A `UserId` cannot be passed where an `OrderId` is expected, even though both are strings at runtime. Use this for IDs, tokens, and any values where mixing would cause silent bugs.

**`satisfies`.** Validates that a value conforms to a type without widening the inferred type. Use it for config objects and lookup tables where you want the compiler to verify shape without losing literal type specificity. Default to type annotations for most declarations; `satisfies` earns its keep on complex objects where narrowed inference matters.

## Common Pitfalls

**Type assertions hide errors.** `as` and `!` are escape hatches that silence the compiler without runtime checks. Prefer narrowing (type guards, `instanceof`, `in` checks) over assertions. When assertions are unavoidable, add a comment explaining why the compiler is wrong. Never use `!` without a comment.

**`any` leaks silently.** A single `any` in a function signature can make the return type `any`, infecting callers without triggering errors. Use `unknown` when a value is genuinely untyped. `unknown` forces narrowing before use, keeping the type system engaged. Suppress `any` warnings only in tests, with documented justification. Use `@ts-expect-error` (never `@ts-ignore`) for known compiler limitations.

**Enum sharp edges.** `const enum` is fragile across compilation boundaries. Numeric enums allow confusing reverse mapping. Enums don't participate cleanly in union narrowing. Prefer union types (`type Status = "pending" | "complete"`) or `as const` objects. Union types compose with the rest of the type system (mapped types, conditional types, template literals) in ways enums cannot.

**Overly loose generics.** Uninitialized generics default to `unknown`, which callers then fight. Specify generic type parameters explicitly when inference isn't obvious. Initialize generic collections with types: `new Set<string>()`, not `new Set()`.

## Community Conventions

**`unknown` over `any`.** The TypeScript team, Google, and most community guides agree. `any` turns off checking; `unknown` forces narrowing. The distinction is enforcement.

**Explicit return types on public APIs.** Explicit return types on exported functions prevent accidental API changes during refactoring. Inferred types are fine for local and private functions.

**Interfaces for object shapes, `type` for everything else.** Interfaces have better IDE support and error messages. Reserve `type` for unions, intersections, tuples, mapped types, and conditional types. Pick one convention for object shapes and enforce it.

**Simple utility types, not type gymnastics.** `Partial`, `Pick`, `Omit`, and `Record` are fine. Custom multi-level conditional types are a maintenance liability. A little repetition is cheaper than a complex type expression that only the author can read.

## Strict Mode

`strictNullChecks` and `noImplicitAny` are non-negotiable. They catch entire categories of runtime errors (null/undefined dereference, untyped parameters silently becoming `any`). `noUncheckedIndexedAccess` catches real bugs at array/object access sites but adds ceremony on every index operation; worth enabling on new projects. `strictFunctionTypes` catches real bugs in event handlers and callbacks through contravariant parameter checking.

## Testing Patterns

**Dependency injection over module mocking.** Module mocking (`jest.mock()`, `mock.module()`) couples tests to import paths and is fragile. In Bun specifically, `mock.module()` can cause infinite loops. Design code so dependencies are passed as parameters. A function that takes a `clock` parameter is testable without patching; a function that calls `Date.now()` internally requires test infrastructure to fight the runtime.

**Type-level tests for type-level APIs.** When the type is the API (branded types, generic utilities, discriminated union factories), use `@ts-expect-error` to verify that invalid usage produces compile errors. `expect-type` provides a fluent API for more complex compile-time assertions. Not needed for application-level code where runtime tests already exercise the types.

**Bun-specific.** `mock.module()` is off limits (infinite loops, scope leakage). Use `spyOn(object, "method")` for method mocking on DI-injected objects. Use `mock()` from `bun:test` for function stubs.
