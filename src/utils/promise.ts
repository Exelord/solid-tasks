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
