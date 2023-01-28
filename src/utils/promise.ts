export async function cancellablePromise<T>(
  signal: AbortSignal,
  promise: Promise<T>
) {
  signal.throwIfAborted();

  return Promise.race([
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          reject(signal.reason);
        },
        { once: true, passive: true }
      );
    }),
    promise,
  ]);
}

export function timeoutPromise(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
