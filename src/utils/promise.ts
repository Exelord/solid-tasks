export interface ControlledPromise<T = any> extends Promise<T> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function controlledPromise<T = any>(): ControlledPromise<T> {
  let resolve;
  let reject;

  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  }) as ControlledPromise<T>;

  promise.resolve = resolve as any as ControlledPromise["resolve"];
  promise.reject = reject as any as ControlledPromise["reject"];

  return promise;
}

export function cancellablePromise<T>(
  signal: AbortSignal,
  promise: Promise<T>
) {
  return Promise.race([
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(signal.reason);
      });
    }),
    promise,
  ]);
}

export function timeoutPromise(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
