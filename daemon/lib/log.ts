export interface Log {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export type CreateLog = (tag: string) => Log;

function formatMessage(tag: string, args: unknown[]): string {
  return `[${tag}] ${args.join(" ")}`;
}

export function consoleLog(tag: string): Log {
  return {
    error(...args: unknown[]) {
      console.error(formatMessage(tag, args));
    },
    warn(...args: unknown[]) {
      console.warn(formatMessage(tag, args));
    },
    info(...args: unknown[]) {
      console.log(formatMessage(tag, args));
    },
    debug(...args: unknown[]) {
      console.debug(formatMessage(tag, args));
    },
  };
}

const NULL_LOG: Log = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

export function nullLog(_tag: string): Log {
  return NULL_LOG;
}

export function collectingLog(tag: string): {
  log: Log;
  messages: { error: string[]; warn: string[]; info: string[]; debug: string[] };
} {
  const messages = { error: [] as string[], warn: [] as string[], info: [] as string[], debug: [] as string[] };
  const log: Log = {
    error(...args: unknown[]) {
      messages.error.push(formatMessage(tag, args));
    },
    warn(...args: unknown[]) {
      messages.warn.push(formatMessage(tag, args));
    },
    info(...args: unknown[]) {
      messages.info.push(formatMessage(tag, args));
    },
    debug(...args: unknown[]) {
      messages.debug.push(formatMessage(tag, args));
    },
  };
  return { log, messages };
}
