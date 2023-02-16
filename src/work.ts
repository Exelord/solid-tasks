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

export async function work<T>(signal: AbortSignal, promise: Promise<T>) {
  signal.throwIfAborted();

  const controlledPromise = abortablePromise<never>(signal);

  try {
    return await Promise.race([controlledPromise.promise, promise]);
  } finally {
    controlledPromise.abort();
  }
}

export async function timeout(signal: AbortSignal, ms: number): Promise<void> {
  return work(signal, new Promise((resolve) => setTimeout(resolve, ms)));
}
