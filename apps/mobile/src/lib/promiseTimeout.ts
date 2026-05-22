export class PromiseTimeoutError extends Error {
  readonly code = 'TIMEOUT';

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'PromiseTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PromiseTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
