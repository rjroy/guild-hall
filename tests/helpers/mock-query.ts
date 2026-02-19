import type { QueryFn } from "@/lib/agent";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Attaches the Query interface stubs (interrupt, close) to an async generator.
 * The SDK returns generators with these methods; tests need them to avoid
 * type errors even though the methods are never exercised.
 */
function attachQueryStubs(gen: AsyncGenerator<SDKMessage>): ReturnType<QueryFn> {
  (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
  (gen as unknown as Record<string, unknown>).close = () => {};
  return gen as ReturnType<QueryFn>;
}

/**
 * Creates a mock Query object that yields the given messages in order.
 */
export function createMockQuery(messages: SDKMessage[]): ReturnType<QueryFn> {
  async function* generator() {
    for (const msg of messages) {
      yield await Promise.resolve(msg);
    }
  }
  return attachQueryStubs(generator());
}

/**
 * Creates a QueryFn that returns a mock query yielding the given messages.
 */
export function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => createMockQuery(messages);
}

/**
 * Creates a QueryFn that yields some messages then throws an error.
 * Useful for simulating expired session errors from the SDK.
 */
export function createErrorQueryFn(
  messagesBeforeError: SDKMessage[],
  errorMessage: string,
): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messagesBeforeError) {
        yield await Promise.resolve(msg);
      }
      throw new Error(errorMessage);
    }
    return attachQueryStubs(generator());
  };
}

/**
 * Creates a QueryFn that immediately rejects on the first yield.
 */
export function createFailingQueryFn(error: Error): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      yield await Promise.reject(error);
    }
    return attachQueryStubs(generator());
  };
}

/**
 * Creates a QueryFn that records the options passed to each call.
 * Returns the captured calls array and the query function.
 */
export function createCapturingQueryFn(messages: SDKMessage[]): {
  queryFn: QueryFn;
  calls: Array<{ prompt: string; options: Record<string, unknown> }>;
} {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

  const queryFn: QueryFn = (params) => {
    calls.push({
      prompt: params.prompt,
      options: (params.options ?? {}) as Record<string, unknown>,
    });
    return createMockQueryFn(messages)(params);
  };

  return { queryFn, calls };
}
