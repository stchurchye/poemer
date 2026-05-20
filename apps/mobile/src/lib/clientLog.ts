type LogEntry = {
  ts: string;
  event: string;
  meta?: Record<string, unknown>;
};

const buffer: LogEntry[] = [];
const MAX = 200;

export function clientLog(event: string, meta?: Record<string, unknown>) {
  buffer.push({ ts: new Date().toISOString(), event, meta });
  if (buffer.length > MAX) buffer.shift();
}

export function getRecentLogs(count = 50): string {
  return JSON.stringify(buffer.slice(-count), null, 2);
}
