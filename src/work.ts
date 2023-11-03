function abortablePromise<T>(signal: AbortSignal) {
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((_, reject_) => {
    reject = reject_;
  });

  const callback = () => {
    reject(signal.reason);
  };

  signal.addEventListener("abort", callback, {
    once: true,
    passive: true,
  });

  return {
    promise,
    abort(): void {
      signal.removeEventListener("abort", callback);
      reject();
    },
  };
}

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

  const controlledPromise = abortablePromise<never>(signal);

  try {
    return await Promise.race([controlledPromise.promise, promise]);
  } finally {
    controlledPromise.abort();
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
  return work(signal, new Promise((resolve) => setTimeout(resolve, ms)));
}
