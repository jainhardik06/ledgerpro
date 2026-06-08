type LogContext = Record<string, unknown>;

export function logError(message: string, error: unknown, context: LogContext = {}) {
  const detail = error instanceof Error
    ? { name: error.name, message: error.message, stack: process.env.NODE_ENV === 'production' ? undefined : error.stack }
    : { error: String(error) };

  console.error(JSON.stringify({
    level: 'error',
    message,
    ...context,
    ...detail,
    timestamp: new Date().toISOString(),
  }));
}
