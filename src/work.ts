/**
 * Run a promise with an abort signal.
 * @param signal An abort signal.
 * @param promise A promise to run.
 * @returns A promise that resolves when the given promise resolves or the abort signal is aborted.
 * @throws If the abort signal is aborted.
 * @example
 * ```ts
 * const controller = new AbortController();
 * const promise = new Promise((resolve) => setTimeout(resolve, 1000));
 *
 * await work(controller.signal, promise);
 * ```
 */
export async function work<T>(signal: AbortSignal, promise: Promise<T>) {
  signal.throwIfAborted();

  const { promise: signalPromise, reject } = Promise.withResolvers<never>();

  const callback = () => {
    reject(signal.reason);
  };

  signal.addEventListener("abort", callback, { once: true });

  try {
    return await Promise.race([signalPromise, promise]);
  } finally {
    signal.removeEventListener("abort", callback);
    reject();
  }
}

/**
 * Creates abortable timeout.
 * @param signal An abort signal.
 * @param ms The number of milliseconds to wait before resolving the promise.
 * @returns A promise that resolves after the given number of milliseconds or the abort signal is aborted.
 * @throws If the abort signal is aborted.
 * @example
 * ```ts
 * const controller = new AbortController();
 *
 * await timeout(controller.signal, 1000);
 * ```
 */
export async function timeout(signal: AbortSignal, ms: number): Promise<void> {
  return work(
    signal,
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      // Clear the pending timer on abort so it does not keep the event loop
      // alive for the remainder of `ms` after the work has already settled.
      signal.addEventListener("abort", () => clearTimeout(timer), {
        once: true,
      });
    }),
  );
}
