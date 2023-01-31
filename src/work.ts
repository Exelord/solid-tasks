export async function work<T>(signal: AbortSignal, promise: Promise<T>) {
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

export async function timeout(signal: AbortSignal, ms: number): Promise<void> {
  return work(signal, new Promise((resolve) => setTimeout(resolve, ms)));
}
