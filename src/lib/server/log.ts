// Structured logger: emits one JSON-lines record per call to stdout (stderr
// for errors). No external deps — Vercel captures stdout/stderr into the
// function log stream and GitHub Actions shows them inline in the workflow.
//
// Usage:
//   log('info', 'scrape.list.fetched', { count: 115, durationMs: 1240 });
//   log('error', 'scrape.waf_challenge', { url, jarSource: 'cached' });

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

// Small helper for timing blocks: returns a function that logs on invocation.
// Example:
//   const done = timer('scrape.jar.mint');
//   await mintJar();
//   done({ jarSize: jar.size });
export function timer(event: string, fields: LogFields = {}) {
  const start = Date.now();
  return (extra: LogFields = {}) => {
    log('info', event, { ...fields, ...extra, durationMs: Date.now() - start });
  };
}
